import { Router } from 'express';
import { eq, and, ne, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { issues, statuses, projects, notifications, users } from '../../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Cards assigned to the current user, across every project, that aren't
// done yet — powers the "assigned to you" card list.
router.get('/assigned-issues', async (req, res) => {
  const rows = await db
    .select({
      id: issues.id,
      key: issues.key,
      title: issues.title,
      priority: issues.priority,
      dueDate: issues.dueDate,
      createdAt: issues.createdAt,
      projectKey: projects.key,
      projectName: projects.name,
    })
    .from(issues)
    .innerJoin(statuses, eq(issues.statusId, statuses.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .where(and(eq(issues.assigneeId, req.user.id), ne(statuses.category, 'done')));
  res.json({ issues: rows });
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
