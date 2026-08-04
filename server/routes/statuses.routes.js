import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { statuses, issues } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const projectStatusesRouter = Router({ mergeParams: true });
projectStatusesRouter.use(requireAuth);

projectStatusesRouter.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, req.params.projectId))
    .orderBy(statuses.order);
  res.json({ statuses: rows });
});

projectStatusesRouter.post('/', requireRole(['admin']), async (req, res) => {
  const { name, category, color, order } = req.body || {};
  if (!name || !['todo', 'in_progress', 'done'].includes(category)) {
    return res.status(400).json({ error: 'Name and a valid category (todo/in_progress/done) are required' });
  }
  const [created] = await db
    .insert(statuses)
    .values({ projectId: req.params.projectId, name: name.trim(), category, color: color || null, order: order ?? 0 })
    .returning();
  res.json({ status: created });
});

export const statusByIdRouter = Router();
statusByIdRouter.use(requireAuth);

statusByIdRouter.patch('/:id', requireRole(['admin']), async (req, res) => {
  const { name, category, color, order } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (category !== undefined) patch.category = category;
  if (color !== undefined) patch.color = color;
  if (order !== undefined) patch.order = order;
  const [updated] = await db.update(statuses).set(patch).where(eq(statuses.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Status not found' });
  res.json({ status: updated });
});

statusByIdRouter.delete('/:id', requireRole(['admin']), async (req, res) => {
  const [inUse] = await db.select({ id: issues.id }).from(issues).where(eq(issues.statusId, req.params.id)).limit(1);
  if (inUse) {
    return res.status(409).json({ error: 'Cannot delete a status that still has issues. Move them first.' });
  }
  await db.delete(statuses).where(eq(statuses.id, req.params.id));
  res.json({ success: true });
});
