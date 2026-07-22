import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDb,
  getBoard,
  upsertTask,
  updateTaskStage,
  deleteTask,
  addMember,
  removeMember,
  clearAllTasks,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.get('/api/board', async (req, res) => {
  try {
    const data = await getBoard();
    res.json(data);
  } catch (err) {
    console.error('Error getting board data:', err);
    res.status(500).json({ error: 'Failed to retrieve board data' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = req.body;
    if (!task || !task.id || !task.title) {
      return res.status(400).json({ error: 'Invalid task data' });
    }
    await upsertTask(task);
    res.json({ success: true, task });
  } catch (err) {
    console.error('Error upserting task:', err);
    res.status(500).json({ error: 'Failed to save task' });
  }
});

app.patch('/api/tasks/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    if (!stage) {
      return res.status(400).json({ error: 'Stage is required' });
    }
    await updateTaskStage(id, stage);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating task stage:', err);
    res.status(500).json({ error: 'Failed to move task stage' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTask(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.post('/api/members', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Member name required' });
    }
    await addMember(name.trim());
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/members/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await removeMember(decodeURIComponent(name));
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
    await clearAllTasks();
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing tasks:', err);
    res.status(500).json({ error: 'Failed to clear tasks' });
  }
});

// Serve static frontend files in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

// SPA Fallback
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.resolve(distPath, 'index.html'));
});

// Initialize database and start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Mira Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
  });
