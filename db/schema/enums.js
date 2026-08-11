import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'member', 'viewer']);
export const statusCategoryEnum = pgEnum('status_category', ['todo', 'in_progress', 'done']);
export const priorityEnum = pgEnum('priority', ['urgent', 'high', 'medium', 'low']);
export const notificationTypeEnum = pgEnum('notification_type', ['assignment', 'comment', 'mention']);
