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
// `verify-full`). Strip it and encrypt-without-verifying instead — local
// Docker Postgres has no SSL configured at all, so it's left untouched.
const connectionString = isLocal
  ? rawConnectionString
  : rawConnectionString.replace(/[?&]sslmode=[^&]+/, '');

export const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });
