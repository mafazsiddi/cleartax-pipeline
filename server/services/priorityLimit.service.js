import { eq, and, ne } from 'drizzle-orm';
import { issues, statuses } from '../../db/schema/index.js';

// Caps how many currently-active (non-"done") cards a single assignor can
// have marked urgent/high in one project, so priority stays meaningful
// instead of everything getting flagged urgent.
export const PRIORITY_LIMITS = { urgent: 1, high: 2 };

export async function countActivePriority(db, projectId, assignorId, excludeIssueId) {
  if (!assignorId) return { urgent: 0, high: 0 };
  const rows = await db
    .select({ id: issues.id, priority: issues.priority })
    .from(issues)
    .innerJoin(statuses, eq(issues.statusId, statuses.id))
    .where(and(eq(issues.projectId, projectId), eq(issues.assignorId, assignorId), ne(statuses.category, 'done')));
  const filtered = excludeIssueId ? rows.filter((r) => r.id !== excludeIssueId) : rows;
  return {
    urgent: filtered.filter((r) => r.priority === 'urgent').length,
    high: filtered.filter((r) => r.priority === 'high').length,
  };
}

export function priorityLimitError(priority, usage) {
  const limit = PRIORITY_LIMITS[priority];
  if (limit == null || usage[priority] < limit) return null;
  const label = priority === 'urgent' ? 'Urgent' : 'High';
  return `${label} priority limit reached — you can only have ${limit} active ${label.toLowerCase()} card${limit === 1 ? '' : 's'} per project.`;
}
