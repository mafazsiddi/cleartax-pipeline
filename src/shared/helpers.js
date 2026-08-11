export const AVATAR_COLORS = [
  '#4338CA', '#0E7490', '#B45309', '#9333EA',
  '#BE185D', '#15803D', '#2563EB', '#7C3AED',
];

export function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dueMeta(due, isDone) {
  if (!due) return null;
  const t = new Date(todayStr() + 'T00:00:00');
  const d = new Date(due + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  const short = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (isDone) return { label: short, state: 'normal' };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, state: 'overdue' };
  if (diff === 0) return { label: 'Due today', state: 'today' };
  if (diff === 1) return { label: 'Due tomorrow', state: 'soon' };
  if (diff <= 3) return { label: `Due in ${diff}d`, state: 'soon' };
  return { label: short, state: 'normal' };
}

export const PRIORITIES = [
  { id: 'urgent', name: 'Urgent', color: 'var(--p-urgent)', rank: 0 },
  { id: 'high', name: 'High', color: 'var(--p-high)', rank: 1 },
  { id: 'medium', name: 'Medium', color: 'var(--p-medium)', rank: 2 },
  { id: 'low', name: 'Low', color: 'var(--p-low)', rank: 3 },
];
export const PMAP = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]));
const PRANK = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.rank]));

export function sortIssues(a, b) {
  const pa = PRANK[a.priority] ?? 9;
  const pb = PRANK[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  const da = a.dueDate || '9999-99-99';
  const db = b.dueDate || '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

// Mirrors server/services/priorityLimit.service.js — keep both in sync.
export const PRIORITY_LIMITS = { urgent: 1, high: 2 };

// Counts a given assignor's currently-active (non-"done") urgent/high cards,
// optionally excluding one card's own id (so editing a card doesn't count
// its own current priority against itself).
export function activePriorityUsage(issues, assignorId, excludeIssueId) {
  const mine = issues.filter(
    (i) => i.assignorId === assignorId && i.statusCategory !== 'done' && i.id !== excludeIssueId
  );
  return {
    urgent: mine.filter((i) => i.priority === 'urgent').length,
    high: mine.filter((i) => i.priority === 'high').length,
  };
}

export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
