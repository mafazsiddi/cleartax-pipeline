import { db } from '../../db/client.js';
import { notifications } from '../../db/schema/index.js';

/**
 * Inserts one notification row per recipient. Never throws — the action that
 * triggered it (assigning, commenting) has already succeeded by the time
 * this runs, and a notification failure shouldn't look like that failed.
 */
export async function createNotifications({ recipientIds, actorId, type, issueId, preview }) {
  try {
    const ids = [...new Set(recipientIds)].filter((id) => id && id !== actorId);
    if (ids.length === 0) return;
    await db.insert(notifications).values(
      ids.map((recipientId) => ({ recipientId, actorId, type, issueId, preview: preview || null }))
    );
  } catch (err) {
    console.error('[notifications] Failed to create notification:', err.message);
  }
}
