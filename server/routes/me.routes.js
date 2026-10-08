import { asyncRouter as Router } from '../lib/asyncRouter.js';
import { eq, and, ne, isNull, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { issues, statuses, projects, notifications, users, labels, issueLabels } from '../../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Cards assigned to one or more users, across every project, that aren't
// done yet — powers the "assigned to you" card list. Defaults to just the
// current user; pass ?userIds=a,b,c to see a chosen group's cards combined.
// When the viewer is one of the target users, also pulls in cards they
// aren't assigned to but have an unread comment/mention on — e.g. a card
// you filed and asked someone to QA, where they just replied to you. Those
// only ever reflect the viewer's own notifications, never a teammate's.
router.get('/assigned-issues', async (req, res) => {
  const requested = (req.query.userIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  const targetUserIds = requested.length ? requested : [req.user.id];
  const includeOwnActivity = targetUserIds.includes(req.user.id);

  const issueColumns = {
    id: issues.id,
    key: issues.key,
    title: issues.title,
    priority: issues.priority,
    dueDate: issues.dueDate,
    createdAt: issues.createdAt,
    issueTypeId: issues.issueTypeId,
    property: issues.property,
    region: issues.region,
    link: issues.link,
    projectKey: projects.key,
    projectName: projects.name,
    statusName: statuses.name,
    statusCategory: statuses.category,
    assigneeId: issues.assigneeId,
    assignorId: issues.assignorId,
  };

  const assignedRows = await db
    .select(issueColumns)
    .from(issues)
    .innerJoin(statuses, eq(issues.statusId, statuses.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .where(and(inArray(issues.assigneeId, targetUserIds), ne(statuses.category, 'done')));

  let rows = assignedRows;

  if (includeOwnActivity) {
    const notifiedIssueRows = await db
      .selectDistinct({ issueId: notifications.issueId })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, req.user.id),
          inArray(notifications.type, ['comment', 'mention']),
          isNull(notifications.readAt)
        )
      );
    const alreadyIncluded = new Set(assignedRows.map((r) => r.id));
    const extraIssueIds = notifiedIssueRows.map((n) => n.issueId).filter((id) => !alreadyIncluded.has(id));

    if (extraIssueIds.length) {
      const extraRows = await db
        .select(issueColumns)
        .from(issues)
        .innerJoin(statuses, eq(issues.statusId, statuses.id))
        .innerJoin(projects, eq(issues.projectId, projects.id))
        .where(and(inArray(issues.id, extraIssueIds), ne(statuses.category, 'done')));
      rows = [...assignedRows, ...extraRows];
    }
  }

  if (rows.length === 0) return res.json({ issues: [] });

  const issueIds = rows.map((r) => r.id);
  const peopleIds = [...new Set(rows.flatMap((r) => [r.assigneeId, r.assignorId]).filter(Boolean))];

  const [peopleRows, labelRows, unreadCommentRows] = await Promise.all([
    peopleIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, peopleIds))
      : Promise.resolve([]),
    db
      .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(inArray(issueLabels.issueId, issueIds)),
    // Unread "someone commented" notifications for the viewer, scoped to
    // these cards — powers the comment badge on My Tasks. Covers both plain
    // comments on cards you're assigned and replies that @-mention you (the
    // commenter and mentionee get different notification types — see
    // notifyComment in comments.routes.js). Only reflects the viewer's own
    // notifications, so filtering by a teammate won't show comment badges on
    // their cards (those notifications went to them, not you).
    db
      .select({ issueId: notifications.issueId })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, req.user.id),
          inArray(notifications.type, ['comment', 'mention']),
          isNull(notifications.readAt),
          inArray(notifications.issueId, issueIds)
        )
      ),
  ]);

  const peopleMap = Object.fromEntries(peopleRows.map((u) => [u.id, u.name]));
  const labelsByIssue = {};
  for (const l of labelRows) (labelsByIssue[l.issueId] ||= []).push({ id: l.id, name: l.name, color: l.color });
  const unreadCommentsByIssue = {};
  for (const n of unreadCommentRows) unreadCommentsByIssue[n.issueId] = (unreadCommentsByIssue[n.issueId] || 0) + 1;

  const enriched = rows.map((r) => ({
    ...r,
    assigneeName: r.assigneeId ? peopleMap[r.assigneeId] || null : null,
    assignorName: r.assignorId ? peopleMap[r.assignorId] || null : null,
    labels: labelsByIssue[r.id] || [],
    unreadComments: unreadCommentsByIssue[r.id] || 0,
  }));
  res.json({ issues: enriched });
});

const NOTIFICATIONS_LIMIT = 30;

// Recent activity for the current user — assignments, comments on their
// cards, and mentions — powers the notification bell.
router.get('/notifications', async (req, res) => {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      preview: notifications.preview,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      issueKey: issues.key,
      issueTitle: issues.title,
      projectKey: projects.key,
      actorName: users.name,
    })
    .from(notifications)
    .innerJoin(issues, eq(notifications.issueId, issues.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(eq(notifications.recipientId, req.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATIONS_LIMIT);
  res.json({ notifications: rows });
});

router.patch('/notifications/:id/read', async (req, res) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, req.params.id), eq(notifications.recipientId, req.user.id)));
  res.json({ success: true });
});

router.post('/notifications/read-all', async (req, res) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, req.user.id), isNull(notifications.readAt)));
  res.json({ success: true });
});

export default router;
