import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

const app = createApp();

// Serve the built frontend + SPA fallback for local/non-Vercel deploys.
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.resolve(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Mira server running on port ${PORT}`);
});
