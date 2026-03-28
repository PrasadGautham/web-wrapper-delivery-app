import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { Pool } from 'pg';

import { PostgresStore } from '../src/services/postgres-store.js';
import type { DatabaseShape } from '../src/domain/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function resetDatabase(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      truncate table
        audit_logs,
        password_reset_tokens,
        sessions,
        orders,
        admin_users,
        restaurants,
        drivers,
        merchants
      restart identity cascade
    `);
  } finally {
    await pool.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed Postgres.');
  }

  const schemaPath = path.join(rootDir, 'sql', 'schema.sql');
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as DatabaseShape;
  const store = new PostgresStore(connectionString, schemaPath);
  await store.read();
  await resetDatabase(connectionString);
  await store.write(seed);
  console.log('Postgres reset and seeded from backend/data/seed.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
