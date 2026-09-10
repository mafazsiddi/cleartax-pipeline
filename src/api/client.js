const BASE = '/api';

// Mirrors the express.json() ceiling in server/app.js. Checking here means an
// oversized card is refused with an actionable message *before* the round
// trip — and it still reports properly when the host (Vercel caps request
// bodies at 4.5mb) would drop the request before our own handler sees it.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function apiFetch(path, { method = 'GET', body, token, headers = {} } = {}) {
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined && new Blob([payload]).size > MAX_BODY_BYTES) {
    const err = new Error(
      "That's too much content to save in one go. Shorten the description, or import fewer rows at a time."
    );
    err.status = 413;
    throw err;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: payload,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // no JSON body — leave data as {}
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
