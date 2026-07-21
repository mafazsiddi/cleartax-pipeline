import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../pipeline.sqlite');

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
const SEED_MEMBERS = ['Aarav', 'Priya', 'Jordan', 'Sana'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

const uid = () =>
  `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const SEED_TASKS = [
  { title: 'Redesign pricing page hero', stage: 'design', priority: 'high', assignee: 'Priya', figmaLink: 'https://figma.com', description: 'New hero with a clearer plan comparison. Waiting on final copy from marketing.', due: 3 },
  { title: 'Build /income-tax-calculator landing', stage: 'development', priority: 'urgent', assignee: 'Aarav', figmaLink: '', description: 'Responsive build from approved mockups. Wire up the calculator component.', due: 1 },
  { title: 'QA checkout flow on mobile', stage: 'qa', priority: 'medium', assignee: 'Sana', figmaLink: '', description: 'Test iOS + Android, verify all payment states and error handling.', due: -1 },
  { title: 'Icon set for dashboard cards', stage: 'design_review', priority: 'low', assignee: 'Jordan', figmaLink: 'https://figma.com', description: '12 line icons, awaiting design review sign-off.', due: 5 },
  { title: 'Refresh footer links + legal', stage: 'backlog', priority: 'low', assignee: '', figmaLink: '', description: 'Update footer nav and add new compliance links.', due: null },
  { title: 'Homepage launch banner', stage: 'done', priority: 'high', assignee: 'Aarav', figmaLink: '', description: 'Shipped and verified in production.', due: null },
];

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
      createdAt INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS members (
      name TEXT PRIMARY KEY
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
  const memberRows = await all(`SELECT name FROM members ORDER BY name ASC`);
  return {
    tasks,
    members: memberRows.map((m) => m.name),
  };
}

export async function upsertTask(task) {
  await run(
    `INSERT INTO tasks (id, title, description, assignee, priority, dueDate, figmaLink, stage, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       assignee = excluded.assignee,
       priority = excluded.priority,
       dueDate = excluded.dueDate,
       figmaLink = excluded.figmaLink,
       stage = excluded.stage`,
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
    ]
  );
}

export async function updateTaskStage(id, stage) {
  await run(`UPDATE tasks SET stage = ? WHERE id = ?`, [stage, id]);
}

export async function deleteTask(id) {
  await run(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function addMember(name) {
  await run(`INSERT OR IGNORE INTO members (name) VALUES (?)`, [name]);
}

export async function removeMember(name) {
  await run(`DELETE FROM members WHERE name = ?`, [name]);
  await run(`UPDATE tasks SET assignee = '' WHERE assignee = ?`, [name]);
}

export async function clearAllTasks() {
  await run(`DELETE FROM tasks`);
}
