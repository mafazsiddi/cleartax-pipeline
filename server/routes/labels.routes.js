import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { labels } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const projectLabelsRouter = Router({ mergeParams: true });
projectLabelsRouter.use(requireAuth);

projectLabelsRouter.get('/', async (req, res) => {
  const rows = await db.select().from(labels).where(eq(labels.projectId, req.params.projectId)).orderBy(labels.name);
  res.json({ labels: rows });
});

projectLabelsRouter.post('/', requireRole(['member', 'admin']), async (req, res) => {
  const { name, color } = req.body || {};
  if (!name || !String(name).trim() || !color) {
    return res.status(400).json({ error: 'Name and color are required' });
  }
  try {
    const [created] = await db
      .insert(labels)
      .values({ projectId: req.params.projectId, name: name.trim(), color })
      .returning();
    res.json({ label: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Label "${name}" already exists in this project.` });
    }
    console.error('Create label error:', err);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

export const labelByIdRouter = Router();
labelByIdRouter.use(requireAuth);

labelByIdRouter.delete('/:id', requireRole(['admin']), async (req, res) => {
  await db.delete(labels).where(eq(labels.id, req.params.id));
  res.json({ success: true });
});
