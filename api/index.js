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
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const trimmed = email.trim();
  const domain = trimmed.split('@')[1];
  const allowed = ['clear.in', 'cleartax.in', 'cleartax.com'];
  if (!domain || !allowed.includes(domain.toLowerCase())) {
    return res.status(403).json({ error: 'Access restricted to clear.in and cleartax.com domains' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  try {
    if (usePostgres) {
      await initPg();
      await pool.query(
        `INSERT INTO auth_otps (email, otp, expires_at) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
        [trimmed, otp, expiresAt]
      );
    } else {
      memoryBoardData.otps = memoryBoardData.otps || {};
      memoryBoardData.otps[trimmed] = { otp, expiresAt };
    }

    const resendApiKey = process.env.RESEND_API_KEY || 're_jMdBxx4F_BmrEghhjChBb8QP26ZybA6Eu';
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Pipeline Auth <onboarding@resend.dev>',
        to: [trimmed],
        subject: 'Your Pipeline Verification Code',
        html: `
          <div style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Pipeline Access Code</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.5;">Use the verification code below to sign in to the Pipeline Kanban board:</p>
            <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #4f46e5;">${otp}</span>
            </div>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.4; margin-bottom: 0;">This code will expire in 5 minutes. If you did not request this code, you can safely ignore this email.</p>
          </div>
        `
      })
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error('Resend API error:', errorText);
      return res.status(500).json({ error: 'Failed to send verification email via Resend' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ error: 'Server error sending OTP' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  const trimmedEmail = email.trim();
  const trimmedOtp = otp.trim();

  try {
    let otpRecord = null;
    if (usePostgres) {
      await initPg();
      const dbRes = await pool.query('SELECT * FROM auth_otps WHERE email = $1', [trimmedEmail]);
      otpRecord = dbRes.rows[0];
    } else {
      memoryBoardData.otps = memoryBoardData.otps || {};
      otpRecord = memoryBoardData.otps[trimmedEmail];
    }

    if (!otpRecord || otpRecord.otp !== trimmedOtp || Date.now() > Number(otpRecord.expires_at)) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    if (usePostgres) {
      await pool.query('DELETE FROM auth_otps WHERE email = $1', [trimmedEmail]);
    } else {
      delete memoryBoardData.otps[trimmedEmail];
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

    return res.json({ token: sessionToken, email: trimmedEmail });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Server error verifying OTP' });
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
