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

export const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });
