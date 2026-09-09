import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error('DATABASE_URL is not set');
}

const isLocal = /localhost|127\.0\.0\.1/.test(rawConnectionString);

// Hosted providers (Supabase, Neon, etc.) commonly present a cert chain
// that recent pg/node versions won't verify by default when `sslmode=require`
// is in the connection string (newer pg-connection-string treats `require` as
// `verify-full`). Strip just that param (keeping any others, e.g. Supabase's
// pooler appends `&supa=...`) and encrypt-without-verifying instead — local
// Docker Postgres has no SSL configured at all, so it's left untouched.
function stripSslMode(url) {
  const [base, query] = url.split('?');
  if (!query) return url;
  const params = new URLSearchParams(query);
  params.delete('sslmode');
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

const connectionString = isLocal ? rawConnectionString : stripSslMode(rawConnectionString);

// Each Vercel lambda instance gets its own pool, so `max` is a per-instance
// figure — under load the real connection count is (instances × max) and a
// generous value here is what exhausts Postgres. Keep it just high enough for
// the handlers that fan out with Promise.all.
const isServerless = !!process.env.VERCEL;
const maxConnections = Number(process.env.DB_POOL_MAX) || (isServerless ? 3 : 10);

export const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: maxConnections,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// A pool with no 'error' listener rethrows when an *idle* client dies — which
// Supabase's pooler does routinely — and that takes down the whole process
// (locally) or the in-flight invocation (on Vercel). Swallowing it here lets
// pg discard the dead client and hand out a fresh one on the next query.
pool.on('error', (err) => {
  console.error('[db] Idle client error (connection discarded):', err.message);
});

export const db = drizzle(pool, { schema });
