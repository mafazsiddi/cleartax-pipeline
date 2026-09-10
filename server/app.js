import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import meRoutes from './routes/me.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import { projectStatusesRouter, statusByIdRouter } from './routes/statuses.routes.js';
import issueTypesRoutes from './routes/issueTypes.routes.js';
import { projectIssuesRouter, issueByIdRouter } from './routes/issues.routes.js';
import { projectLabelsRouter, labelByIdRouter } from './routes/labels.routes.js';
import { issueCommentsRouter, commentByIdRouter } from './routes/comments.routes.js';
import { blobTokenRouter, issueAttachmentsRouter, attachmentByIdRouter } from './routes/attachments.routes.js';
import { issueLinksRouter, issueLinkByIdRouter } from './routes/issueLinks.routes.js';

// body-parser's 100kb default is far too small for this app: a card's
// description is a free-text paste (real ones have hit ~320kb) and a bulk CSV
// import carries up to 500 rows in one body. Both used to fail as a bare 500.
// 4mb leaves headroom under Vercel's 4.5mb request cap — past that the
// platform rejects the request before it ever reaches Express.
const JSON_BODY_LIMIT = '4mb';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/me', meRoutes);

  app.use('/api/projects/:projectId/statuses', projectStatusesRouter);
  app.use('/api/projects/:projectId/issues', projectIssuesRouter);
  app.use('/api/projects/:projectId/labels', projectLabelsRouter);
  app.use('/api/projects', projectsRoutes);

  app.use('/api/statuses', statusByIdRouter);
  app.use('/api/issue-types', issueTypesRoutes);
  app.use('/api/labels', labelByIdRouter);

  app.use('/api/issues/:issueId/comments', issueCommentsRouter);
  app.use('/api/issues/:issueId/attachments', issueAttachmentsRouter);
  app.use('/api/issues/:issueId/links', issueLinksRouter);
  app.use('/api/issues', issueByIdRouter);

  app.use('/api/comments', commentByIdRouter);
  app.use('/api/attachments', blobTokenRouter);
  app.use('/api/attachments', attachmentByIdRouter);
  app.use('/api/issue-links', issueLinkByIdRouter);

  // Scoped to /api so the local-dev entrypoint can still add static file
  // serving + SPA fallback for everything else after createApp() returns.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // A malformed or oversized body is the caller's problem, not ours —
    // reporting it as a 500 sends people hunting for a server bug that
    // isn't there, and tells them nothing about how to succeed.
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: `That's too much content for one request (limit ${JSON_BODY_LIMIT}). Shorten the description, or import fewer rows at a time.`,
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON in request body' });
    }

    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
