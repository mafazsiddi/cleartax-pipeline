import { pgTable, uuid, text, integer, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { statusCategoryEnum } from './enums.js';

export const statuses = pgTable(
  'statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: statusCategoryEnum('category').notNull(),
    color: text('color'),
    order: integer('order').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectOrderIdx: index('statuses_project_order_idx').on(t.projectId, t.order),
    uniqueNamePerProject: unique('statuses_project_name_unique').on(t.projectId, t.name),
  })
).enableRLS();
