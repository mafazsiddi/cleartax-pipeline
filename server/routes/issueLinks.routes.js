import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { issueLinks, issues } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Any member (not just the assignor/admin) can add or remove links — same
// permission model as the old single attachmentLink field it replaces.
export const issueLinksRouter = Router({ mergeParams: true });
issueLinksRouter.use(requireAuth);

issueLinksRouter.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(issueLinks)
    .where(eq(issueLinks.issueId, req.params.issueId))
    .orderBy(issueLinks.createdAt);
  res.json({ links: rows });
});

issueLinksRouter.post('/', requireRole(['member', 'admin']), async (req, res) => {
  const [existing] = await db.select().from(issues).where(eq(issues.id, req.params.issueId)).limit(1);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  const { url } = req.body || {};
  if (!url || !String(url).trim()) return res.status(400).json({ error: 'A URL is required' });
  const [created] = await db
    .insert(issueLinks)
    .values({ issueId: req.params.issueId, url: url.trim(), createdById: req.user.id })
    .returning();
  res.json({ link: created });
});

export const issueLinkByIdRouter = Router();
issueLinkByIdRouter.use(requireAuth);

issueLinkByIdRouter.delete('/:id', requireRole(['member', 'admin']), async (req, res) => {
  await db.delete(issueLinks).where(eq(issueLinks.id, req.params.id));
  res.json({ success: true });
});
