import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { Pool } from 'pg';

import { PostgresStore } from '../src/services/postgres-store.js';
import type { DatabaseShape } from '../src/domain/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function prepareAndResetDatabase(connectionString: string, schemaSql: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query('drop schema if exists public cascade');
    await pool.query('create schema public');
    await pool.query(schemaSql);
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
  const schemaSql = readFileSync(schemaPath, 'utf8');
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as DatabaseShape;
  const store = new PostgresStore(connectionString, schemaPath);
  await prepareAndResetDatabase(connectionString, schemaSql);
  await store.write(seed);
  console.log('Postgres reset and seeded from backend/data/seed.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
