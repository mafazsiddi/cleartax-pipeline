import { Router } from 'express';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { issues, statuses, projects } from '../../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Cards assigned to the current user, across every project, that aren't
// done yet — powers the notification bell's "assigned to you" list.
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

export default router;
