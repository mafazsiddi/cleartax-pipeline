import { pgTable, text, integer } from 'drizzle-orm/pg-core';

// Lookup table rather than a Postgres enum: needs icon/color/hierarchy
// metadata, and enums are painful to reorder or extend later.
export const issueTypes = pgTable('issue_types', {
  id: text('id').primaryKey(), // 'epic' | 'story' | 'task' | 'bug' | 'subtask'
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  hierarchyLevel: integer('hierarchy_level').notNull(), // 0=Epic, 1=Story/Task/Bug, 2=Subtask
});
