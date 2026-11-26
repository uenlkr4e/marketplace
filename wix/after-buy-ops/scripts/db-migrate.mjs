// Applies db/schema.sql to the database in DATABASE_URL.
// Reads DATABASE_URL from the environment, or from .env.local (written by `wix app env pull`).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = fileURLToPath(new URL('..', import.meta.url));

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = `${root}.env.local`;
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  }
  throw new Error('DATABASE_URL is not set. Run `npx wix app env pull` first.');
}

const sql = neon(databaseUrl());
const statements = readFileSync(`${root}db/schema.sql`, 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}
const [{ count }] = await sql.query('select count(*)::int as count from return_requests');
console.log(`Schema applied (${statements.length} statements). return_requests rows: ${count}`);
