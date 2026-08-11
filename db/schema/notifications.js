import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';
import { users } from './users.js';
import { notificationTypeEnum } from './enums.js';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    preview: text('preview'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => ({
    recipientIdx: index('notifications_recipient_idx').on(t.recipientId, t.createdAt),
  })
);
