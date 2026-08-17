import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';
import { users } from './users.js';

export const issueLinks = pgTable(
  'issue_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    issueIdx: index('issue_links_issue_idx').on(t.issueId),
  })
).enableRLS();
