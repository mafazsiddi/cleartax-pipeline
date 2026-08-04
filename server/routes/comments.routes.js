import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { comments, users } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const issueCommentsRouter = Router({ mergeParams: true });
issueCommentsRouter.use(requireAuth);

issueCommentsRouter.get('/', async (req, res) => {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      author: { id: users.id, name: users.name, email: users.email },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.issueId, req.params.issueId))
    .orderBy(comments.createdAt);
  res.json({ comments: rows });
});

issueCommentsRouter.post('/', requireRole(['member', 'admin']), async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  const [created] = await db
    .insert(comments)
    .values({ issueId: req.params.issueId, authorId: req.user.id, body })
    .returning();
  res.json({ comment: { ...created, author: req.user } });
});

export const commentByIdRouter = Router();
commentByIdRouter.use(requireAuth);

async function loadOwnedComment(req, res, next) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, req.params.id)).limit(1);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the author or an admin can modify this comment' });
  }
  req.comment = comment;
  next();
}

commentByIdRouter.patch('/:id', loadOwnedComment, async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  const [updated] = await db
    .update(comments)
    .set({ body, editedAt: new Date() })
    .where(eq(comments.id, req.params.id))
    .returning();
  res.json({ comment: updated });
});

commentByIdRouter.delete('/:id', loadOwnedComment, async (req, res) => {
  await db.delete(comments).where(eq(comments.id, req.params.id));
  res.json({ success: true });
});
