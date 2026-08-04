import { sql, eq } from 'drizzle-orm';
import { projects } from '../../db/schema/index.js';

/**
 * Atomically claims the next issue number for a project and returns its
 * human-facing key (e.g. "ENG-123"). Must run inside the same transaction
 * as the issue insert — never read the counter then write it separately,
 * or concurrent creates in the same project can produce duplicate keys.
 */
export async function nextIssueKey(tx, projectId) {
  const [row] = await tx
    .update(projects)
    .set({ issueSeq: sql`${projects.issueSeq} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ key: projects.key, issueSeq: projects.issueSeq });

  if (!row) throw new Error('Project not found');
  return `${row.key}-${row.issueSeq}`;
}
