import { Router } from 'express';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { projects, statuses, issues, attachments } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { blobEnabled, deleteBlob } from '../services/blob.service.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_STATUSES = [
  { name: 'To Do', category: 'todo', order: 0, isDefault: true },
  { name: 'In Progress', category: 'in_progress', order: 1, isDefault: false },
  { name: 'In Review', category: 'in_progress', order: 2, isDefault: false },
  { name: 'Done', category: 'done', order: 3, isDefault: false },
];

router.get('/', async (req, res) => {
  const rows = await db.select().from(projects).where(isNull(projects.archivedAt)).orderBy(projects.key);
  res.json({ projects: rows });
});

router.post('/', requireRole(['admin']), async (req, res) => {
  const { key, name, description, leadId } = req.body || {};
  const cleanKey = String(key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(cleanKey)) {
    return res.status(400).json({ error: 'Project key must be 2-10 letters/numbers, starting with a letter.' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({ key: cleanKey, name: name.trim(), description: description || '', leadId: leadId || null })
        .returning();
      await tx.insert(statuses).values(DEFAULT_STATUSES.map((s) => ({ ...s, projectId: created.id })));
      return created;
    });
    res.json({ project });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Project key "${cleanKey}" is already in use.` });
    }
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/by-key/:key', async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.key, String(req.params.key).toUpperCase()))
    .limit(1);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

router.get('/:id', async (req, res) => {
  const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

router.patch('/:id', requireRole(['admin']), async (req, res) => {
  const { name, description, leadId } = req.body || {};
  const patch = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (leadId !== undefined) patch.leadId = leadId;
  const [updated] = await db.update(projects).set(patch).where(eq(projects.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: updated });
});

router.post('/:id/archive', requireRole(['admin']), async (req, res) => {
  const [updated] = await db
    .update(projects)
    .set({ archivedAt: new Date() })
    .where(eq(projects.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: updated });
});

// Permanently deletes a project and everything under it (statuses, issues,
// comments, labels — all cascade at the DB level). Attachment *files* live
// outside Postgres in Blob storage, so those are cleaned up here first,
// best-effort, before the DB cascade removes their rows.
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (blobEnabled()) {
    const rows = await db
      .select({ blobUrl: attachments.blobUrl })
      .from(attachments)
      .innerJoin(issues, eq(attachments.issueId, issues.id))
      .where(eq(issues.projectId, project.id));
    await Promise.all(
      rows.map(({ blobUrl }) =>
        deleteBlob(blobUrl).catch((err) => console.error('Failed to delete blob during project delete:', blobUrl, err))
      )
    );
  }

  await db.delete(projects).where(eq(projects.id, project.id));
  res.json({ success: true });
});

export default router;
