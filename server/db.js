import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../mira.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper for promise-based db methods
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

// Seed data
const SEED_MEMBERS = [];
const SEED_TASKS = [];

// SQLite has no ADD COLUMN IF NOT EXISTS — ignore the "duplicate column" error.
async function addColumn(table, definition) {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
  }
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assignee TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      dueDate TEXT DEFAULT '',
      figmaLink TEXT DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'backlog',
      createdAt INTEGER NOT NULL,
      assignedBy TEXT DEFAULT ''
    )
  `);
  await addColumn('tasks', `assignedBy TEXT DEFAULT ''`);

  await run(`
    CREATE TABLE IF NOT EXISTS members (
      name TEXT PRIMARY KEY,
      email TEXT DEFAULT ''
    )
  `);
  await addColumn('members', `email TEXT DEFAULT ''`);

  await run(`
    CREATE TABLE IF NOT EXISTS auth_otps (
      email TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  // Check if members empty
  const members = await all(`SELECT * FROM members`);
  if (members.length === 0) {
    for (const m of SEED_MEMBERS) {
      await run(`INSERT OR IGNORE INTO members (name) VALUES (?)`, [m]);
    }
  }

  // Check if tasks empty
  const tasks = await all(`SELECT * FROM tasks`);
  if (tasks.length === 0) {
    const now = Date.now();
    for (let i = 0; i < SEED_TASKS.length; i++) {
      const t = SEED_TASKS[i];
      const dueDate = t.due == null ? '' : offsetDate(t.due);
      await run(
        `INSERT INTO tasks (id, title, description, assignee, priority, dueDate, figmaLink, stage, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid(), t.title, t.description, t.assignee, t.priority, dueDate, t.figmaLink, t.stage, now + i]
      );
    }
  }
}

export async function getBoard() {
  const tasks = await all(`SELECT * FROM tasks ORDER BY createdAt ASC`);
  const memberRows = await all(`SELECT name, email FROM members ORDER BY name ASC`);
  return {
    tasks,
    members: memberRows.map((m) => m.name),
    memberEmails: Object.fromEntries(memberRows.filter((m) => m.email).map((m) => [m.name, m.email])),
  };
}

export async function getTaskAssignee(id) {
  const rows = await all(`SELECT assignee FROM tasks WHERE id = ?`, [id]);
  return rows[0]?.assignee || '';
}

export async function getMemberEmail(name) {
  if (!name) return '';
  const rows = await all(`SELECT email FROM members WHERE name = ?`, [name]);
  return rows[0]?.email || '';
}

export async function listMembers() {
  return all(`SELECT name, email FROM members ORDER BY name ASC`);
}

export async function upsertTask(task) {
  await run(
    `INSERT INTO tasks (id, title, description, assignee, priority, dueDate, figmaLink, stage, createdAt, assignedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       assignee = excluded.assignee,
       priority = excluded.priority,
       dueDate = excluded.dueDate,
       figmaLink = excluded.figmaLink,
       stage = excluded.stage,
       assignedBy = excluded.assignedBy`,
    [
      task.id,
      task.title || '',
      task.description || '',
      task.assignee || '',
      task.priority || 'medium',
      task.dueDate || '',
      task.figmaLink || '',
      task.stage || 'backlog',
      task.createdAt || Date.now(),
      task.assignedBy || '',
    ]
  );
}

/* ------------------------------ auth ------------------------------ */

export async function saveOtp(email, otp, expiresAt, createdAt) {
  await run(
    `INSERT INTO auth_otps (email, otp, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       otp = excluded.otp,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`,
    [email, otp, expiresAt, createdAt]
  );
}

export async function getOtp(email) {
  const rows = await all(`SELECT * FROM auth_otps WHERE email = ?`, [email]);
  return rows[0] || null;
}

export async function bumpOtpAttempts(email) {
  await run(`UPDATE auth_otps SET attempts = attempts + 1 WHERE email = ?`, [email]);
}

export async function deleteOtp(email) {
  await run(`DELETE FROM auth_otps WHERE email = ?`, [email]);
}

export async function saveSession(token, email, expiresAt) {
  await run(`INSERT INTO user_sessions (token, email, expires_at) VALUES (?, ?, ?)`, [
    token, email, expiresAt,
  ]);
}

export async function getSession(token) {
  const rows = await all(`SELECT * FROM user_sessions WHERE token = ?`, [token]);
  return rows[0] || null;
}

export async function deleteSession(token) {
  await run(`DELETE FROM user_sessions WHERE token = ?`, [token]);
}

export async function updateTaskStage(id, stage) {
  await run(`UPDATE tasks SET stage = ? WHERE id = ?`, [stage, id]);
}

export async function deleteTask(id) {
  await run(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function addMember(name, email = '') {
  await run(
    `INSERT INTO members (name, email) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET email = COALESCE(NULLIF(excluded.email, ''), members.email)`,
    [name, email]
  );
}

export async function removeMember(name) {
  await run(`DELETE FROM members WHERE name = ?`, [name]);
  await run(`UPDATE tasks SET assignee = '' WHERE assignee = ?`, [name]);
}

export async function clearAllTasks() {
  await run(`DELETE FROM tasks`);
}
