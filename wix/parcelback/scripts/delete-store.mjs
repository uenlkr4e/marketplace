// Deletes everything stored for one store (Wix app instance ID): return and
// withdrawal requests, settings and order locks. Same as the app's
// "app removed" event handler; use it for deletion requests sent to support.
//
//   npm run db:delete-store -- <instanceId>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const instanceId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(instanceId ?? '')) {
  console.error('Usage: npm run db:delete-store -- <instanceId>');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
let url = process.env.DATABASE_URL;
if (!url && existsSync(`${root}.env.local`)) {
  const line = readFileSync(`${root}.env.local`, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  url = line?.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
}
if (!url) throw new Error('DATABASE_URL is not set. Run `npx wix app env pull` first.');

const sql = neon(url);
const [requests, settings, locks] = await sql.transaction(
  [
    sql`delete from return_requests where instance_id = ${instanceId}`,
    sql`delete from store_settings where instance_id = ${instanceId}`,
    sql`delete from order_locks where instance_id = ${instanceId}`,
  ],
  { fullResults: true },
);
console.log(`Deleted ${requests.rowCount} requests, ${settings.rowCount} settings rows, ${locks.rowCount} locks for ${instanceId}.`);
