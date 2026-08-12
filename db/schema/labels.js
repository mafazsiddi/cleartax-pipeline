import { pgTable, uuid, text, primaryKey, unique } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { issues } from './issues.js';

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  (t) => ({
    uniquePerProject: unique('labels_project_name_unique').on(t.projectId, t.name),
  })
).enableRLS();

export const issueLabels = pgTable(
  'issue_labels',
  {
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.issueId, t.labelId] }),
  })
).enableRLS();
