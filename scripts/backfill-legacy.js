#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * ONE-TIME PRODUCTION CUTOVER SCRIPT — read this before running it.
 *
 * Migrates the old flat `tasks`/`members` schema into the new
 * users/projects/statuses/issues schema, then applies the Drizzle
 * migrations, then backfills the migrated data into the new tables.
 *
 * WHY THIS ORDER MATTERS: the old schema already has tables named
 * `auth_otps` and `user_sessions` (used by the old email-OTP login),
 * and the new Drizzle schema defines tables with the SAME NAMES but
 * incompatible columns (old user_sessions has `email`, new has
 * `user_id`). Running `npm run db:migrate` against a database that
 * still has the old-shaped tables will either fail outright (name
 * collision) or, worse, leave the wrong-shaped table in place and
 * break every login at runtime. So this script:
 *   1. Reads the OLD tasks/members data into memory.
 *   2. Drops the OLD tasks/members/auth_otps/user_sessions/user_invites
 *      tables (auth_otps/user_sessions only ever held ephemeral
 *      sign-in state — nobody loses anything real by re-signing in).
 *   3. Runs the Drizzle migrations to create the new schema.
 *   4. Seeds issue_types.
 *   5. Inserts the migrated data into the new schema.
 *
 * Run this ONCE, manually, against production, right before deploying
 * the new backend — not from cron, not from a build step. Take a
 * database backup/snapshot first if your host offers one.
 *
 * Usage:
 *   DATABASE_URL=<prod-connection-string> node scripts/backfill-legacy.js
 *
 * Optional env vars:
 *   MIGRATION_FALLBACK_EMAIL — used as the reporter for any old task
 *     whose "assignedBy" can't be matched to a migrated user. Required
 *     only if such a task exists; the script tells you if it does.
 * ------------------------------------------------------------------ */

import 'dotenv/config';
import pg from 'pg';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema/index.js';
import { users, projects, statuses, issues, issueTypes } from '../db/schema/index.js';

const STAGE_MAP = [
  { id: 'backlog', name: 'Backlog', category: 'todo', order: 0 },
  { id: 'design', name: 'Design', category: 'todo', order: 1 },
  { id: 'design_review', name: 'Design Review', category: 'in_progress', order: 2 },
  { id: 'development', name: 'Development', category: 'in_progress', order: 3 },
  { id: 'qa', name: 'QA', category: 'in_progress', order: 4 },
  { id: 'done', name: 'Done', category: 'done', order: 5 },
];

const ISSUE_TYPES = [
  { id: 'epic', name: 'Epic', icon: 'zap', color: '#8b5cf6', hierarchyLevel: 0 },
  { id: 'story', name: 'Story', icon: 'bookmark', color: '#22c55e', hierarchyLevel: 1 },
  { id: 'task', name: 'Task', icon: 'check-square', color: '#3b82f6', hierarchyLevel: 1 },
  { id: 'bug', name: 'Bug', icon: 'bug', color: '#ef4444', hierarchyLevel: 1 },
  { id: 'subtask', name: 'Subtask', icon: 'corner-down-right', color: '#64748b', hierarchyLevel: 2 },
];

const LEGACY_PROJECT_KEY = process.env.MIGRATION_PROJECT_KEY || 'LEG';
const LEGACY_PROJECT_NAME = process.env.MIGRATION_PROJECT_NAME || 'Legacy Board';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new pg.Pool({ connectionString, max: 3 });
  const raw = await pool.connect();

  console.log('--- Phase 1: reading old tasks/members ---');
  let oldTasks = [];
  let oldMembers = [];
  try {
    const t = await raw.query('SELECT * FROM tasks');
    oldTasks = t.rows;
    const m = await raw.query('SELECT * FROM members');
    oldMembers = m.rows;
    console.log(`Found ${oldTasks.length} tasks, ${oldMembers.length} members.`);
  } catch (err) {
    console.log('No old tasks/members tables found (nothing to migrate):', err.message);
  }

  console.log('--- Phase 2: dropping old tables ---');
  await raw.query(`
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS members;
    DROP TABLE IF EXISTS auth_otps;
    DROP TABLE IF EXISTS user_sessions;
    DROP TABLE IF EXISTS user_invites;
  `);
  raw.release();
  console.log('Old tables dropped.');

  console.log('--- Phase 3: applying Drizzle migrations ---');
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.log('Migrations applied.');

  console.log('--- Phase 4: seeding issue types ---');
  for (const type of ISSUE_TYPES) {
    await db.insert(issueTypes).values(type).onConflictDoUpdate({ target: issueTypes.id, set: type });
  }

  if (oldTasks.length === 0 && oldMembers.length === 0) {
    console.log('Nothing to backfill. Done.');
    await pool.end();
    return;
  }

  console.log('--- Phase 5: backfilling data ---');

  // Members -> users. Only members with an email become real accounts
  // (users.email is required — there's no way to sign a nameless
  // account in without one). Others are logged and left unassigned.
  const nameToUserId = new Map();
  const skippedMembers = [];
  for (const m of oldMembers) {
    const email = (m.email || '').trim().toLowerCase();
    if (!email) {
      skippedMembers.push(m.name);
      continue;
    }
    const [user] = await db
      .insert(users)
      .values({ email, name: m.name })
      .onConflictDoNothing({ target: users.email })
      .returning();
    const row = user || (await db.select().from(users).where(eq(users.email, email)))[0];
    if (row) nameToUserId.set(m.name.toLowerCase(), row.id);
  }
  if (skippedMembers.length) {
    console.warn(`Skipped ${skippedMembers.length} member(s) with no email (can't create a login-less account):`, skippedMembers);
  }

  const fallbackEmail = (process.env.MIGRATION_FALLBACK_EMAIL || '').trim().toLowerCase();
  let fallbackUserId = null;
  if (fallbackEmail) {
    const [existing] = await db.select().from(users).where(eq(users.email, fallbackEmail));
    if (existing) {
      fallbackUserId = existing.id;
    } else {
      const [created] = await db.insert(users).values({ email: fallbackEmail, name: fallbackEmail.split('@')[0] }).returning();
      fallbackUserId = created?.id || null;
    }
  }
  if (!fallbackUserId && nameToUserId.size > 0) {
    fallbackUserId = nameToUserId.values().next().value;
  }

  // One legacy project with 6 statuses matching the old stage names.
  const [project] = await db
    .insert(projects)
    .values({ key: LEGACY_PROJECT_KEY, name: LEGACY_PROJECT_NAME, issueSeq: 0 })
    .onConflictDoNothing({ target: projects.key })
    .returning();
  const proj = project || (await db.select().from(projects).where(eq(projects.key, LEGACY_PROJECT_KEY)))[0];

  const stageToStatusId = new Map();
  for (const s of STAGE_MAP) {
    const [status] = await db
      .insert(statuses)
      .values({ projectId: proj.id, name: s.name, category: s.category, order: s.order, isDefault: s.id === 'backlog' })
      .returning();
    stageToStatusId.set(s.id, status.id);
  }

  let migratedCount = 0;
  let unresolvedReporters = 0;
  for (let i = 0; i < oldTasks.length; i++) {
    const t = oldTasks[i];
    const statusId = stageToStatusId.get(t.stage) || stageToStatusId.get('backlog');
    const assigneeId = t.assignee ? nameToUserId.get(String(t.assignee).toLowerCase()) || null : null;
    let reporterId = t.assignedBy ? nameToUserId.get(String(t.assignedBy).toLowerCase()) : null;
    if (!reporterId) {
      reporterId = assigneeId || fallbackUserId;
      if (!reporterId) unresolvedReporters++;
    }
    if (!reporterId) continue; // reporterId is NOT NULL — can't insert without one

    const [{ issueSeq }] = await db
      .update(projects)
      .set({ issueSeq: sql`${projects.issueSeq} + 1` })
      .where(eq(projects.id, proj.id))
      .returning({ issueSeq: projects.issueSeq });

    await db.insert(issues).values({
      key: `${LEGACY_PROJECT_KEY}-${issueSeq}`,
      projectId: proj.id,
      issueTypeId: 'task',
      statusId,
      title: t.title,
      description: [t.description, t.figmaLink ? `Figma link: ${t.figmaLink}` : ''].filter(Boolean).join('\n\n'),
      assigneeId,
      reporterId,
      priority: t.priority || 'medium',
      dueDate: t.dueDate || null,
      createdAt: t.createdAt ? new Date(Number(t.createdAt)) : new Date(),
    });
    migratedCount++;
  }

  console.log(`Migrated ${migratedCount}/${oldTasks.length} tasks into project ${LEGACY_PROJECT_KEY}.`);
  if (unresolvedReporters > 0) {
    console.warn(`${unresolvedReporters} task(s) skipped — no resolvable reporter. Set MIGRATION_FALLBACK_EMAIL and re-run, or fix manually.`);
  }
  console.log('Remember: promote your own account to admin —');
  console.log(`  UPDATE users SET role='admin' WHERE email='you@yourdomain.com';`);

  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
