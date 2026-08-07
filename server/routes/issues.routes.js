import { Router } from 'express';
import { eq, and, or, ilike, asc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { issues, issueTypes, statuses, users, labels, issueLabels } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { nextIssueKey } from '../services/issueKey.service.js';
import { canEditIssue } from '../services/issueAccess.service.js';
import { sendMail, mailEnabled, mailConfig, assignmentEmail } from '../../lib/mail.js';

const HIERARCHY = { epic: 0, story: 1, task: 1, bug: 1, subtask: 2 };

async function resolveDefaultStatus(tx, projectId) {
  const rows = await tx.select().from(statuses).where(eq(statuses.projectId, projectId)).orderBy(asc(statuses.order));
  return rows.find((s) => s.isDefault) || rows[0] || null;
}

function issueSelection() {
  return {
    id: issues.id,
    key: issues.key,
    projectId: issues.projectId,
    issueTypeId: issues.issueTypeId,
    parentId: issues.parentId,
    statusId: issues.statusId,
    title: issues.title,
    description: issues.description,
    assigneeId: issues.assigneeId,
    assignorId: issues.assignorId,
    reporterId: issues.reporterId,
    priority: issues.priority,
    dueDate: issues.dueDate,
    storyPoints: issues.storyPoints,
    property: issues.property,
    region: issues.region,
    link: issues.link,
    attachmentLink: issues.attachmentLink,
    boardOrder: issues.boardOrder,
    createdAt: issues.createdAt,
    updatedAt: issues.updatedAt,
    resolvedAt: issues.resolvedAt,
  };
}

/**
 * Notify a teammate that an issue is now theirs. Only fires when the
 * assignee actually changed, and never throws — saving the issue matters
 * more than the email going out.
 */
async function notifyAssignment(issue, previousAssigneeId, req) {
  try {
    if (!issue.assigneeId || issue.assigneeId === previousAssigneeId) return;
    if (!mailEnabled()) return;

    const [assignee] = await db.select().from(users).where(eq(users.id, issue.assigneeId)).limit(1);
    if (!assignee?.email) return;

    const [status] = await db.select().from(statuses).where(eq(statuses.id, issue.statusId)).limit(1);
    const { appUrl } = mailConfig();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const link = appUrl || (host ? `${proto}://${host}` : '');

    const tpl = assignmentEmail({
      issue,
      statusName: status?.name || '',
      assignee: assignee.name,
      assignedBy: req.user?.name || '',
      appUrl: link,
    });
    await sendMail({ to: assignee.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch (err) {
    console.error('[mail] Assignment notification failed:', err.message);
  }
}

export const projectIssuesRouter = Router({ mergeParams: true });
projectIssuesRouter.use(requireAuth);

projectIssuesRouter.get('/', async (req, res) => {
  const { assigneeId, priority, issueTypeId, q } = req.query;
  const conditions = [eq(issues.projectId, req.params.projectId)];
  if (assigneeId) conditions.push(eq(issues.assigneeId, assigneeId));
  if (priority) conditions.push(eq(issues.priority, priority));
  if (issueTypeId) conditions.push(eq(issues.issueTypeId, issueTypeId));
  if (q) conditions.push(or(ilike(issues.title, `%${q}%`), ilike(issues.key, `%${q}%`)));

  const rows = await db
    .select(issueSelection())
    .from(issues)
    .where(and(...conditions))
    .orderBy(asc(issues.boardOrder));

  if (rows.length === 0) return res.json({ issues: [] });

  const issueIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.flatMap((r) => [r.assigneeId, r.assignorId]).filter(Boolean))];

  const [statusRows, userRows, labelRows] = await Promise.all([
    db.select().from(statuses).where(eq(statuses.projectId, req.params.projectId)),
    userIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
    db
      .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(inArray(issueLabels.issueId, issueIds)),
  ]);

  const statusMap = Object.fromEntries(statusRows.map((s) => [s.id, s]));
  const userMap = Object.fromEntries(userRows.map((u) => [u.id, u.name]));
  const labelsByIssue = {};
  for (const l of labelRows) (labelsByIssue[l.issueId] ||= []).push({ id: l.id, name: l.name, color: l.color });

  const enriched = rows.map((r) => ({
    ...r,
    assigneeName: r.assigneeId ? userMap[r.assigneeId] || null : null,
    assignorName: r.assignorId ? userMap[r.assignorId] || null : null,
    statusCategory: statusMap[r.statusId]?.category || null,
    labels: labelsByIssue[r.id] || [],
  }));
  res.json({ issues: enriched });
});

projectIssuesRouter.post('/', requireRole(['member', 'admin']), async (req, res) => {
  const {
    issueTypeId, parentId, statusId, title, description, assigneeId, priority, dueDate, storyPoints,
    property, region, link, attachmentLink,
  } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });

  const [issueType] = await db.select().from(issueTypes).where(eq(issueTypes.id, issueTypeId)).limit(1);
  if (!issueType) return res.status(400).json({ error: 'Invalid issue type' });

  try {
    const created = await db.transaction(async (tx) => {
      if (parentId) {
        const [parent] = await tx.select().from(issues).where(eq(issues.id, parentId)).limit(1);
        if (!parent || parent.projectId !== req.params.projectId) {
          throw Object.assign(new Error('Parent issue not found in this project'), { statusCode: 400 });
        }
        const [parentType] = await tx.select().from(issueTypes).where(eq(issueTypes.id, parent.issueTypeId)).limit(1);
        if (parentType.hierarchyLevel + 1 !== issueType.hierarchyLevel) {
          throw Object.assign(
            new Error(`A ${issueType.name} cannot be nested under a ${parentType.name}`),
            { statusCode: 400 }
          );
        }
      }

      let status;
      if (statusId) {
        [status] = await tx.select().from(statuses).where(eq(statuses.id, statusId)).limit(1);
        if (!status || status.projectId !== req.params.projectId) {
          throw Object.assign(new Error('Invalid status for this project'), { statusCode: 400 });
        }
      } else {
        status = await resolveDefaultStatus(tx, req.params.projectId);
        if (!status) throw Object.assign(new Error('Project has no workflow statuses'), { statusCode: 400 });
      }

      const key = await nextIssueKey(tx, req.params.projectId);
      const [row] = await tx
        .insert(issues)
        .values({
          key,
          projectId: req.params.projectId,
          issueTypeId,
          parentId: parentId || null,
          statusId: status.id,
          title: title.trim(),
          description: description || '',
          assigneeId: assigneeId || null,
          assignorId: req.user.id,
          reporterId: req.user.id,
          priority: priority || 'medium',
          dueDate: dueDate || null,
          storyPoints: storyPoints ?? null,
          property: property || null,
          region: region || null,
          link: link || null,
          attachmentLink: attachmentLink || null,
        })
        .returning();
      return row;
    });

    await notifyAssignment(created, null, req);
    res.json({ issue: created });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error('Create issue error:', err);
    res.status(statusCode).json({ error: err.message || 'Failed to create issue' });
  }
});

projectIssuesRouter.post('/bulk', requireRole(['member', 'admin']), async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import is limited to 500 rows at a time' });

  try {
    const created = await db.transaction(async (tx) => {
      const projectStatuses = await tx.select().from(statuses).where(eq(statuses.projectId, req.params.projectId));
      const statusesById = Object.fromEntries(projectStatuses.map((s) => [s.id, s]));
      const defaultStatus = projectStatuses.find((s) => s.isDefault) || projectStatuses[0] || null;
      if (!defaultStatus) throw Object.assign(new Error('Project has no workflow statuses'), { statusCode: 400 });

      const createdIssues = [];

      for (const row of rows) {
        if (!row.title || !String(row.title).trim()) {
          throw Object.assign(new Error('A row is missing a title'), { statusCode: 400 });
        }

        const rowStatus = row.statusId && statusesById[row.statusId] ? statusesById[row.statusId] : defaultStatus;

        const key = await nextIssueKey(tx, req.params.projectId);
        const [inserted] = await tx
          .insert(issues)
          .values({
            key,
            projectId: req.params.projectId,
            issueTypeId: 'task',
            statusId: rowStatus.id,
            title: row.title.trim(),
            description: row.description || '',
            reporterId: req.user.id,
            assigneeId: row.assigneeId || null,
            assignorId: row.assignorId || null,
            priority: row.priority || 'medium',
            dueDate: row.dueDate || null,
            property: row.property || null,
            region: row.region || null,
            link: row.link || null,
            attachmentLink: row.attachmentLink || null,
          })
          .returning();

        createdIssues.push({ issue: inserted });
      }

      return { issues: createdIssues, labels: [] };
    });

    res.json(created);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error('Bulk import error:', err);
    res.status(statusCode).json({ error: err.message || 'Bulk import failed' });
  }
});

export const issueByIdRouter = Router();
issueByIdRouter.use(requireAuth);

issueByIdRouter.get('/:id', async (req, res) => {
  const [issue] = await db.select(issueSelection()).from(issues).where(eq(issues.id, req.params.id)).limit(1);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const [issueLabelRows, parentRow] = await Promise.all([
    db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(eq(issueLabels.issueId, issue.id)),
    issue.parentId
      ? db.select({ id: issues.id, key: issues.key, title: issues.title, issueTypeId: issues.issueTypeId }).from(issues).where(eq(issues.id, issue.parentId)).limit(1)
      : Promise.resolve([]),
  ]);

  res.json({ issue: { ...issue, labels: issueLabelRows, parent: parentRow[0] || null } });
});

issueByIdRouter.get('/:id/children', async (req, res) => {
  const rows = await db.select(issueSelection()).from(issues).where(eq(issues.parentId, req.params.id)).orderBy(asc(issues.createdAt));
  res.json({ issues: rows });
});

issueByIdRouter.patch('/:id', requireRole(['member', 'admin']), async (req, res) => {
  const [existing] = await db.select().from(issues).where(eq(issues.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  if (!canEditIssue(req.user, existing)) {
    return res.status(403).json({ error: 'Only the assignor or an admin can edit this card' });
  }

  const {
    title, description, assigneeId, assignorId, priority, dueDate, storyPoints, statusId, boardOrder,
    property, region, link, attachmentLink,
  } = req.body || {};
  const patch = { updatedAt: new Date() };
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (assigneeId !== undefined) patch.assigneeId = assigneeId || null;
  if (assignorId !== undefined) patch.assignorId = assignorId || null;
  if (priority !== undefined) patch.priority = priority;
  if (dueDate !== undefined) patch.dueDate = dueDate || null;
  if (storyPoints !== undefined) patch.storyPoints = storyPoints;
  if (boardOrder !== undefined) patch.boardOrder = boardOrder;
  if (property !== undefined) patch.property = property || null;
  if (region !== undefined) patch.region = region || null;
  if (link !== undefined) patch.link = link || null;
  if (attachmentLink !== undefined) patch.attachmentLink = attachmentLink || null;

  if (statusId !== undefined && statusId !== existing.statusId) {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId)).limit(1);
    if (!status || status.projectId !== existing.projectId) {
      return res.status(400).json({ error: 'Invalid status for this project' });
    }
    patch.statusId = statusId;
    patch.resolvedAt = status.category === 'done' ? new Date() : null;
  }

  const [updated] = await db.update(issues).set(patch).where(eq(issues.id, req.params.id)).returning();
  await notifyAssignment(updated, existing.assigneeId, req);
  res.json({ issue: updated });
});

issueByIdRouter.delete('/:id', requireRole(['admin']), async (req, res) => {
  await db.delete(issues).where(eq(issues.id, req.params.id));
  res.json({ success: true });
});

issueByIdRouter.post('/:id/labels', requireRole(['member', 'admin']), async (req, res) => {
  const [existing] = await db.select().from(issues).where(eq(issues.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  if (!canEditIssue(req.user, existing)) {
    return res.status(403).json({ error: 'Only the assignor or an admin can edit this card' });
  }
  const { labelId } = req.body || {};
  if (!labelId) return res.status(400).json({ error: 'labelId is required' });
  await db.insert(issueLabels).values({ issueId: req.params.id, labelId }).onConflictDoNothing();
  res.json({ success: true });
});

issueByIdRouter.delete('/:id/labels/:labelId', requireRole(['member', 'admin']), async (req, res) => {
  const [existing] = await db.select().from(issues).where(eq(issues.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  if (!canEditIssue(req.user, existing)) {
    return res.status(403).json({ error: 'Only the assignor or an admin can edit this card' });
  }
  await db
    .delete(issueLabels)
    .where(and(eq(issueLabels.issueId, req.params.id), eq(issueLabels.labelId, req.params.labelId)));
  res.json({ success: true });
});
