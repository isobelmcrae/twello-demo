import { Pool, type PoolClient } from "pg";

const globalForDb = globalThis as typeof globalThis & { twelloPool?: Pool };
export const pool = globalForDb.twelloPool ?? new Pool({
  connectionString: process.env.PGHOST ? undefined : process.env.DATABASE_URL || undefined,
  ...(!process.env.PGHOST && process.env.DATABASE_URL ? {} : {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  }),
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
globalForDb.twelloPool = pool;

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
