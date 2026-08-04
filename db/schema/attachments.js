import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { issues } from './issues.js';
import { users } from './users.js';

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id),
    fileName: text('file_name').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: text('mime_type'),
    blobUrl: text('blob_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    issueIdx: index('attachments_issue_idx').on(t.issueId),
  })
);
