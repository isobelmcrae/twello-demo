import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const pool = new Pool(!process.env.PGHOST && process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(482941927)");
  await client.query('CREATE TABLE IF NOT EXISTS twello_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    if ((await client.query('SELECT 1 FROM twello_migration WHERE name=$1', [name])).rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO twello_migration(name) VALUES($1)', [name]);
      await client.query('COMMIT');
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(482941927)');
  client.release();
  await pool.end();
}
