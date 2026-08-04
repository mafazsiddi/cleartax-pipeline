import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { projects } from './projects.js';
import { statuses } from './statuses.js';
import { issueTypes } from './issueTypes.js';
import { issues } from './issues.js';
import { labels, issueLabels } from './labels.js';
import { comments } from './comments.js';
import { attachments } from './attachments.js';

export const usersRelations = relations(users, ({ many }) => ({
  issuesAssigned: many(issues, { relationName: 'assignee' }),
  issuesReported: many(issues, { relationName: 'reporter' }),
  comments: many(comments),
  attachments: many(attachments),
  projectsLed: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  lead: one(users, { fields: [projects.leadId], references: [users.id] }),
  statuses: many(statuses),
  labels: many(labels),
  issues: many(issues),
}));

export const statusesRelations = relations(statuses, ({ one, many }) => ({
  project: one(projects, { fields: [statuses.projectId], references: [projects.id] }),
  issues: many(issues),
}));

export const issueTypesRelations = relations(issueTypes, ({ many }) => ({
  issues: many(issues),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  project: one(projects, { fields: [issues.projectId], references: [projects.id] }),
  issueType: one(issueTypes, { fields: [issues.issueTypeId], references: [issueTypes.id] }),
  status: one(statuses, { fields: [issues.statusId], references: [statuses.id] }),
  parent: one(issues, { fields: [issues.parentId], references: [issues.id], relationName: 'children' }),
  children: many(issues, { relationName: 'children' }),
  assignee: one(users, { fields: [issues.assigneeId], references: [users.id], relationName: 'assignee' }),
  reporter: one(users, { fields: [issues.reporterId], references: [users.id], relationName: 'reporter' }),
  comments: many(comments),
  attachments: many(attachments),
  issueLabels: many(issueLabels),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  project: one(projects, { fields: [labels.projectId], references: [projects.id] }),
  issueLabels: many(issueLabels),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, { fields: [issueLabels.issueId], references: [issues.id] }),
  label: one(labels, { fields: [issueLabels.labelId], references: [labels.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  issue: one(issues, { fields: [comments.issueId], references: [issues.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  issue: one(issues, { fields: [attachments.issueId], references: [issues.id] }),
  uploader: one(users, { fields: [attachments.uploaderId], references: [users.id] }),
}));
