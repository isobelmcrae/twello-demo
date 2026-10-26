import { access, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
try {
  await access('.env.local');
} catch {
  const password = randomBytes(24).toString('hex');
  await writeFile('.env.local', `DATABASE_URL=postgresql://twello:${password}@localhost:55433/twello\nBETTER_AUTH_URL=http://localhost:3100\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\nSMTP_HOST=localhost\nSMTP_PORT=1025\nSMTP_FROM="Twello <hello@twello.local>"\nSMTP_SECURE=false\n`, { mode: 0o600 });
}
process.loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local first.');
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Local services require a local DATABASE_URL.');
const result = spawnSync('docker', ['compose', '-p', 'twello', '-f', 'compose.dev.yml', 'up', '-d', '--wait'], {
  stdio: 'inherit', env: { ...process.env, TWELLO_DEV_DB_PASSWORD: decodeURIComponent(database.password) },
});
process.exitCode = result.status ?? 1;
