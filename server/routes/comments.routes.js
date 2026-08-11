import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { comments, users, issues, projects } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createNotifications } from '../services/notify.service.js';
import { sendMail, mailEnabled, mailConfig, mentionEmail } from '../../lib/mail.js';

// Comment bodies store mentions as `@[Display Name](userId)` — inserted by the
// mention picker in the composer, never hand-typed — so parsing is exact
// instead of guessing at freeform "@name" text.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const PREVIEW_LEN = 140;

function plainText(body) {
  return body.replace(MENTION_RE, (_, name) => `@${name}`);
}

function preview(body) {
  const text = plainText(body);
  return text.length > PREVIEW_LEN ? `${text.slice(0, PREVIEW_LEN)}…` : text;
}

/**
 * Notifies everyone a new comment concerns: the card's assignee (in-app
 * only) and anyone freshly @mentioned (in-app + email). Never throws — the
 * comment is already saved by the time this runs.
 */
async function notifyComment(commentBody, issue, author, req) {
  try {
    const mentionedIds = [...new Set([...commentBody.matchAll(MENTION_RE)].map((m) => m[2]))]
      .filter((id) => id !== author.id);
    const commentPreview = preview(commentBody);

    await createNotifications({
      recipientIds: mentionedIds,
      actorId: author.id,
      type: 'mention',
      issueId: issue.id,
      preview: commentPreview,
    });

    // The assignee hears about every comment on their card, unless they were
    // already just notified as a mention above.
    if (issue.assigneeId && !mentionedIds.includes(issue.assigneeId)) {
      await createNotifications({
        recipientIds: [issue.assigneeId],
        actorId: author.id,
        type: 'comment',
        issueId: issue.id,
        preview: commentPreview,
      });
    }

    if (!mailEnabled() || mentionedIds.length === 0) return;
    const mentionedUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, mentionedIds));
    if (mentionedUsers.length === 0) return;

    const { appUrl } = mailConfig();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = appUrl || (host ? `${proto}://${host}` : '');
    const link = base && issue.projectKey ? `${base}/projects/${issue.projectKey}/board/${issue.key}` : base;

    const tpl = mentionEmail({
      issue,
      mentionedBy: author.name,
      commentText: plainText(commentBody),
      appUrl: link,
    });
    await Promise.all(
      mentionedUsers
        .filter((u) => u.email)
        .map((u) => sendMail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text }))
    );
  } catch (err) {
    console.error('[notifications] Comment notification failed:', err.message);
  }
}

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

  const [issue] = await db
    .select({
      id: issues.id,
      key: issues.key,
      title: issues.title,
      assigneeId: issues.assigneeId,
      projectKey: projects.key,
    })
    .from(issues)
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .where(eq(issues.id, req.params.issueId))
    .limit(1);
  if (issue) await notifyComment(body, issue, req.user, req);

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
