import 'dotenv/config';
import { db, pool } from './client.js';
import { issueTypes } from './schema/index.js';

const ISSUE_TYPES = [
  { id: 'epic', name: 'Epic', icon: 'zap', color: '#8b5cf6', hierarchyLevel: 0 },
  { id: 'story', name: 'Story', icon: 'bookmark', color: '#22c55e', hierarchyLevel: 1 },
  { id: 'task', name: 'Task', icon: 'check-square', color: '#3b82f6', hierarchyLevel: 1 },
  { id: 'bug', name: 'Bug', icon: 'bug', color: '#ef4444', hierarchyLevel: 1 },
  { id: 'subtask', name: 'Subtask', icon: 'corner-down-right', color: '#64748b', hierarchyLevel: 2 },
];

async function main() {
  console.log('Seeding issue types...');
  for (const type of ISSUE_TYPES) {
    await db.insert(issueTypes).values(type).onConflictDoUpdate({
      target: issueTypes.id,
      set: { name: type.name, icon: type.icon, color: type.color, hierarchyLevel: type.hierarchyLevel },
    });
  }
  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
