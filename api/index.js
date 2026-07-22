import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

function cleanVal(v) {
  if (!v) return '';
  const trimmed = v.trim();
  // Strip enclosing single or double quotes
  return trimmed.replace(/^["'](.*)["']$/, '$1');
}

function cleanUrl(url) {
  if (!url) return null;
  const s = cleanVal(url);
  const lower = s.toLowerCase();
  if (
    lower === 'undefined' ||
    lower === 'null' ||
    lower === 'false' ||
    lower === ''
  ) {
    return null;
  }
  // Must start with postgres:// or postgresql://
  if (!lower.startsWith('postgres://') && !lower.startsWith('postgresql://')) {
    return null;
  }
  // Test if it can be parsed successfully by new URL()
  try {
    const normalized = s.startsWith('postgresql://') ? s.replace('postgresql://', 'http://') : s.replace('postgres://', 'http://');
    new URL(normalized);
    return s;
  } catch (e) {
    return null;
  }
}

const pgUser = cleanVal(process.env.cleartaxpipeline_POSTGRES_USER);
const pgPass = cleanVal(process.env.cleartaxpipeline_POSTGRES_PASSWORD);
const pgHost = cleanVal(process.env.cleartaxpipeline_POSTGRES_HOST);
const pgDb = cleanVal(process.env.cleartaxpipeline_POSTGRES_DATABASE);

const directConnectionString = (pgUser && pgPass && pgHost && pgDb) 
  ? `postgres://${pgUser}:${pgPass}@${pgHost}:5432/${pgDb}` 
  : null;

const connectionString = 
  cleanUrl(process.env.DATABASE_URL) || 
  cleanUrl(process.env.cleartaxpipeline_POSTGRES_URL_NON_POOLING) ||
  cleanUrl(process.env.POSTGRES_URL_NON_POOLING) ||
  cleanUrl(directConnectionString) ||
  cleanUrl(process.env.cleartaxpipeline_POSTGRES_URL) || 
  cleanUrl(process.env.POSTGRES_URL);

const usePostgres = !!connectionString;
let pool = null;

function removeSslmode(urlString) {
  if (!urlString) return urlString;
  try {
    const normalized = urlString.startsWith('postgresql://') ? urlString.replace('postgresql://', 'http://') : urlString.replace('postgres://', 'http://');
    const parsed = new URL(normalized);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    const protocol = urlString.startsWith('postgresql://') ? 'postgresql' : 'postgres';
    return `${protocol}://${parsed.username}:${parsed.password}@${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return urlString;
  }
}

if (usePostgres) {
  pool = new pg.Pool({
    connectionString: removeSslmode(connectionString),
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
  tasks: [],
  invites: {}
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_otps (
        email VARCHAR(255) PRIMARY KEY,
        otp VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        expires_at BIGINT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_invites (
        email VARCHAR(255) PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL
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

function maskConnectionString(url) {
  if (!url) return 'null';
  try {
    const normalized = url.startsWith('postgresql://') ? url.replace('postgresql://', 'http://') : url.replace('postgres://', 'http://');
    const parsed = new URL(normalized);
    return `${url.startsWith('postgresql://') ? 'postgresql' : 'postgres'}://${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch (e) {
    return `invalid-format: ${url.slice(0, 30)}...`;
  }
}

const authenticateUser = async (req, res, next) => {
  // Bypass auth check for OTP endpoints
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }

  if (!usePostgres) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const dbRes = await pool.query('SELECT * FROM user_sessions WHERE token = $1', [token]);
    const session = dbRes.rows[0];

    if (!session || Date.now() > Number(session.expires_at)) {
      return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    }

    req.user = { email: session.email };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal Auth Error' });
  }
};

app.use(authenticateUser);

// Custom Auth Endpoints
app.get('/api/auth/invites', async (req, res) => {
  try {
    if (usePostgres) {
      await initPg();
      const dbRes = await pool.query('SELECT name, email, token FROM user_invites');
      return res.json(dbRes.rows);
    } else {
      const list = Object.entries(memoryBoardData.invites || {}).map(([email, info]) => ({
        email,
        token: info.token,
        name: info.name
      }));
      return res.json(list);
    }
  } catch (err) {
    console.error('Failed to get invites:', err);
    return res.status(500).json({ error: 'Failed to retrieve invites' });
  }
});

app.post('/api/auth/invite', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  try {
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

    if (usePostgres) {
      await initPg();
      await pool.query('INSERT INTO members (name) VALUES ($1) ON CONFLICT DO NOTHING', [trimmedName]);
      await pool.query(
        `INSERT INTO user_invites (email, token, name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET token = $2, name = $3`,
        [trimmedEmail, token, trimmedName]
      );
    } else {
      if (!memoryBoardData.members.includes(trimmedName)) {
        memoryBoardData.members.push(trimmedName);
      }
      memoryBoardData.invites = memoryBoardData.invites || {};
      memoryBoardData.invites[trimmedEmail] = { token, name: trimmedName };
    }

    return res.json({ success: true, email: trimmedEmail, token, name: trimmedName });
  } catch (err) {
    console.error('Failed to create/update invite:', err);
    return res.status(500).json({ error: 'Failed to generate invite' });
  }
});

app.post('/api/auth/verify-token', async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required' });
  }
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedToken = token.trim();

  try {
    let record = null;
    if (usePostgres) {
      await initPg();
      const dbRes = await pool.query(
        'SELECT * FROM user_invites WHERE email = $1 AND token = $2',
        [trimmedEmail, trimmedToken]
      );
      record = dbRes.rows[0];
    } else {
      const info = (memoryBoardData.invites || {})[trimmedEmail];
      if (info && info.token === trimmedToken) {
        record = { email: trimmedEmail, token: trimmedToken, name: info.name };
      }
    }

    if (!record) {
      return res.status(401).json({ error: 'Invalid or expired magic link' });
    }

    const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    if (usePostgres) {
      await pool.query(
        `INSERT INTO user_sessions (token, email, expires_at) VALUES ($1, $2, $3)`,
        [sessionToken, trimmedEmail, sessionExpiresAt]
      );
    } else {
      memoryBoardData.sessions = memoryBoardData.sessions || {};
      memoryBoardData.sessions[sessionToken] = { email: trimmedEmail, expiresAt: sessionExpiresAt };
    }

    return res.json({ token: sessionToken, email: trimmedEmail, name: record.name });
  } catch (err) {
    console.error('Verify token error:', err);
    return res.status(500).json({ error: 'Server error verifying token' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      if (usePostgres) {
        await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
      } else {
        if (memoryBoardData.sessions) {
          delete memoryBoardData.sessions[token];
        }
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  return res.json({ success: true });
});

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
    res.status(500).json({ 
      error: 'DB Error', 
      details: err.message, 
      resolvedUrl: maskConnectionString(connectionString),
      stack: err.stack 
    });
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
