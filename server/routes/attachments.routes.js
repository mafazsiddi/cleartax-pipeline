import { Router } from 'express';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { handleUpload } from '@vercel/blob/client';
import { db } from '../../db/client.js';
import { attachments, userSessions, users } from '../../db/schema/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { blobEnabled, getBlobStream, deleteBlob, MAX_UPLOAD_BYTES } from '../services/blob.service.js';

/**
 * Resolve the caller's role from a bearer token. Used instead of the usual
 * requireAuth middleware because @vercel/blob's client `upload()` helper
 * has no way to attach custom headers to its token-request call — auth has
 * to travel through `clientPayload` instead, per Vercel's documented
 * pattern for authenticating client uploads.
 */
async function resolveSessionRole(token) {
  if (!token) return null;
  const rows = await db
    .select({ role: users.role, expiresAt: userSessions.expiresAt, deactivatedAt: users.deactivatedAt })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(eq(userSessions.token, token))
    .limit(1);
  const session = rows[0];
  if (!session || Date.now() > new Date(session.expiresAt).getTime() || session.deactivatedAt) return null;
  return session.role;
}

// Mounted at /api/attachments, ahead of requireAuth — see resolveSessionRole above.
export const blobTokenRouter = Router();

blobTokenRouter.post('/blob-token', async (req, res) => {
  if (!blobEnabled()) {
    return res.status(503).json({ error: 'File storage is not configured yet. Set BLOB_READ_WRITE_TOKEN.' });
  }
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { token, issueId } = JSON.parse(clientPayload || '{}');
        const role = await resolveSessionRole(token);
        if (!role) throw new Error('Not authenticated');
        if (!['member', 'admin'].includes(role)) throw new Error('Forbidden');
        if (!issueId) throw new Error('issueId is required');

        return {
          access: 'private',
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          tokenPayload: JSON.stringify({ issueId }),
        };
      },
      // No-op: rather than relying on this webhook (which Vercel can't
      // deliver to localhost in dev), the client calls our own /confirm
      // endpoint directly once the direct-to-blob upload finishes.
      onUploadCompleted: async () => {},
    });
    res.json(jsonResponse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export const issueAttachmentsRouter = Router({ mergeParams: true });
issueAttachmentsRouter.use(requireAuth);

issueAttachmentsRouter.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.issueId, req.params.issueId))
    .orderBy(attachments.createdAt);
  res.json({ attachments: rows });
});

issueAttachmentsRouter.post('/confirm', requireRole(['member', 'admin']), async (req, res) => {
  const { blobUrl, fileName, fileSize, mimeType } = req.body || {};
  if (!blobUrl || !fileName) return res.status(400).json({ error: 'blobUrl and fileName are required' });
  const [created] = await db
    .insert(attachments)
    .values({
      issueId: req.params.issueId,
      uploaderId: req.user.id,
      fileName,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      blobUrl,
    })
    .returning();
  res.json({ attachment: created });
});

export const attachmentByIdRouter = Router();
attachmentByIdRouter.use(requireAuth);

attachmentByIdRouter.get('/:id/download', async (req, res) => {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, req.params.id)).limit(1);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  if (!blobEnabled()) return res.status(503).json({ error: 'File storage is not configured.' });

  const result = await getBlobStream(attachment.blobUrl);
  if (!result || result.statusCode !== 200) {
    return res.status(404).json({ error: 'File not found in storage' });
  }
  res.setHeader('Content-Type', result.blob.contentType || attachment.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName.replace(/"/g, '')}"`);
  if (result.blob.size) res.setHeader('Content-Length', String(result.blob.size));
  Readable.fromWeb(result.stream).pipe(res);
});

attachmentByIdRouter.delete('/:id', requireRole(['member', 'admin']), async (req, res) => {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, req.params.id)).limit(1);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  if (blobEnabled()) {
    try {
      await deleteBlob(attachment.blobUrl);
    } catch (err) {
      console.error('[blob] Failed to delete object, removing DB row anyway:', err.message);
    }
  }
  await db.delete(attachments).where(eq(attachments.id, req.params.id));
  res.json({ success: true });
});
