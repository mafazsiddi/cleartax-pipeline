import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import { projectStatusesRouter, statusByIdRouter } from './routes/statuses.routes.js';
import issueTypesRoutes from './routes/issueTypes.routes.js';
import { projectIssuesRouter, issueByIdRouter } from './routes/issues.routes.js';
import { projectLabelsRouter, labelByIdRouter } from './routes/labels.routes.js';
import { issueCommentsRouter, commentByIdRouter } from './routes/comments.routes.js';
import { blobTokenRouter, issueAttachmentsRouter, attachmentByIdRouter } from './routes/attachments.routes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);

  app.use('/api/projects/:projectId/statuses', projectStatusesRouter);
  app.use('/api/projects/:projectId/issues', projectIssuesRouter);
  app.use('/api/projects/:projectId/labels', projectLabelsRouter);
  app.use('/api/projects', projectsRoutes);

  app.use('/api/statuses', statusByIdRouter);
  app.use('/api/issue-types', issueTypesRoutes);
  app.use('/api/labels', labelByIdRouter);

  app.use('/api/issues/:issueId/comments', issueCommentsRouter);
  app.use('/api/issues/:issueId/attachments', issueAttachmentsRouter);
  app.use('/api/issues', issueByIdRouter);

  app.use('/api/comments', commentByIdRouter);
  app.use('/api/attachments', blobTokenRouter);
  app.use('/api/attachments', attachmentByIdRouter);

  // Scoped to /api so the local-dev entrypoint can still add static file
  // serving + SPA fallback for everything else after createApp() returns.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
