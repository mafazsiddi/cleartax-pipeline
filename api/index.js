import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

const directConnectionString = (
  process.env.cleartaxpipeline_POSTGRES_USER &&
  process.env.cleartaxpipeline_POSTGRES_PASSWORD &&
  process.env.cleartaxpipeline_POSTGRES_HOST &&
  process.env.cleartaxpipeline_POSTGRES_DATABASE
) ? `postgres://${process.env.cleartaxpipeline_POSTGRES_USER}:${process.env.cleartaxpipeline_POSTGRES_PASSWORD}@${process.env.cleartaxpipeline_POSTGRES_HOST}:5432/${process.env.cleartaxpipeline_POSTGRES_DATABASE}` : null;

const connectionString = 
  process.env.DATABASE_URL || 
  directConnectionString ||
  process.env.cleartaxpipeline_POSTGRES_URL_NON_POOLING ||
  process.env.cleartaxpipeline_POSTGRES_URL || 
  process.env.POSTGRES_URL;

const usePostgres = !!connectionString;
let pool = null;

if (usePostgres) {
  pool = new pg.Pool({
    connectionString: connectionString,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 2000,
    max: 5,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// Memory fallback store (used if process.env.DATABASE_URL is not set)
let memoryBoardData = {
  members: [],
  tasks: []
};

// Auto initialize tables if using Postgres
let pgInitialized = false;
async function initPg() {
  if (!usePostgres || pgInitialized) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assignee VARCHAR(255),
        priority VARCHAR(50),
        "dueDate" VARCHAR(50),
        "figmaLink" TEXT,
        stage VARCHAR(100) NOT NULL,
        "createdAt" BIGINT
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        name VARCHAR(255) PRIMARY KEY
      )
    `);

    // Seed data if empty
    const membersRes = await client.query(`SELECT * FROM members`);
    if (membersRes.rowCount === 0) {
      for (const m of memoryBoardData.members) {
        await client.query(`INSERT INTO members (name) VALUES ($1) ON CONFLICT DO NOTHING`, [m]);
      }
    }

    const tasksRes = await client.query(`SELECT * FROM tasks`);
    if (tasksRes.rowCount === 0) {
      for (const t of memoryBoardData.tasks) {
        await client.query(
          `INSERT INTO tasks (id, title, description, assignee, priority, "dueDate", "figmaLink", stage, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [t.id, t.title, t.description, t.assignee, t.priority, t.dueDate, t.figmaLink, t.stage, Date.now()]
        );
      }
    }
    pgInitialized = true;
  } catch (err) {
    console.error('Error initializing PG database:', err);
  } finally {
    client.release();
  }
}

// API Routes
app.get(['/api/board', '/board', '/'], async (req, res) => {
  try {
    if (usePostgres) {
      await initPg();
      const tasksRes = await pool.query('SELECT * FROM tasks ORDER BY "createdAt" ASC');
      const membersRes = await pool.query('SELECT name FROM members ORDER BY name ASC');
      return res.json({
        tasks: tasksRes.rows,
        members: membersRes.rows.map(r => r.name)
      });
    }
    res.json(memoryBoardData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post(['/api/tasks', '/tasks'], async (req, res) => {
  try {
    const task = req.body;
    if (!task || !task.id) return res.status(400).json({ error: 'Invalid task' });
    
    if (usePostgres) {
      await initPg();
      await pool.query(
        `INSERT INTO tasks (id, title, description, assignee, priority, "dueDate", "figmaLink", stage, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           assignee = EXCLUDED.assignee,
           priority = EXCLUDED.priority,
           "dueDate" = EXCLUDED."dueDate",
           "figmaLink" = EXCLUDED."figmaLink",
           stage = EXCLUDED.stage`,
        [
          task.id,
          task.title || '',
          task.description || '',
          task.assignee || '',
          task.priority || 'medium',
          task.dueDate || '',
          task.figmaLink || '',
          task.stage || 'backlog',
          task.createdAt || Date.now()
        ]
      );
      return res.json({ success: true, task });
    }

    const idx = memoryBoardData.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) memoryBoardData.tasks[idx] = task;
    else memoryBoardData.tasks.push(task);
    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.patch(['/api/tasks/:id/stage', '/tasks/:id/stage'], async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    if (usePostgres) {
      await initPg();
      await pool.query('UPDATE tasks SET stage = $1 WHERE id = $2', [stage, id]);
      return res.json({ success: true });
    }
    const task = memoryBoardData.tasks.find((t) => t.id === id);
    if (task) task.stage = stage;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.delete(['/api/tasks/:id', '/tasks/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    if (usePostgres) {
      await initPg();
      await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return res.json({ success: true });
    }
    memoryBoardData.tasks = memoryBoardData.tasks.filter((t) => t.id !== id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post(['/api/members', '/members'], async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    
    if (usePostgres) {
      await initPg();
      await pool.query('INSERT INTO members (name) VALUES ($1) ON CONFLICT DO NOTHING', [name.trim()]);
      return res.json({ success: true });
    }
    if (!memoryBoardData.members.includes(name.trim())) {
      memoryBoardData.members.push(name.trim());
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.delete(['/api/members/:name', '/members/:name'], async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (usePostgres) {
      await initPg();
      await pool.query('DELETE FROM members WHERE name = $1', [name]);
      await pool.query(`UPDATE tasks SET assignee = '' WHERE assignee = $1`, [name]);
      return res.json({ success: true });
    }
    memoryBoardData.members = memoryBoardData.members.filter((m) => m !== name);
    memoryBoardData.tasks.forEach((t) => {
      if (t.assignee === name) t.assignee = '';
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post(['/api/clear', '/clear'], async (req, res) => {
  try {
    if (usePostgres) {
      await initPg();
      await pool.query('DELETE FROM tasks');
      return res.json({ success: true });
    }
    memoryBoardData.tasks = [];
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB Error' });
  }
});

export default app;
