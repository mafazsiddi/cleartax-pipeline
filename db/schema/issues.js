import { pgTable, uuid, text, integer, doublePrecision, date, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { issueTypes } from './issueTypes.js';
import { statuses } from './statuses.js';
import { users } from './users.js';
import { priorityEnum } from './enums.js';

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    issueTypeId: text('issue_type_id')
      .notNull()
      .references(() => issueTypes.id),
    parentId: uuid('parent_id').references(() => issues.id, { onDelete: 'set null' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => statuses.id),
    title: text('title').notNull(),
    description: text('description').default(''),
    assigneeId: uuid('assignee_id').references(() => users.id),
    assignorId: uuid('assignor_id').references(() => users.id),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    priority: priorityEnum('priority').notNull().default('medium'),
    dueDate: date('due_date'),
    storyPoints: integer('story_points'),
    property: text('property'),
    region: text('region'),
    link: text('link'),
    attachmentLink: text('attachment_link'),
    boardOrder: doublePrecision('board_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    projectStatusIdx: index('issues_project_status_idx').on(t.projectId, t.statusId),
    assigneeIdx: index('issues_assignee_idx').on(t.assigneeId),
    parentIdx: index('issues_parent_idx').on(t.parentId),
  })
);
