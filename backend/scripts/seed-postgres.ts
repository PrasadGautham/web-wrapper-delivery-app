import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { PostgresStore } from '../src/services/postgres-store.js';
import type { DatabaseShape } from '../src/domain/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed Postgres.');
  }

  const schemaPath = path.join(rootDir, 'sql', 'schema.sql');
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as DatabaseShape;
  const store = new PostgresStore(connectionString, schemaPath);
  await store.write(seed);
  console.log('Postgres seeded from backend/data/seed.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
