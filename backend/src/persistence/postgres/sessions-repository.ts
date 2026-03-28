import { PoolClient } from 'pg';

import { SessionRecord } from '../../domain/models.js';

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    token: row.token as string,
    userType: row.user_type as SessionRecord['userType'],
    userId: row.user_id as string,
    tenantId: (row.tenant_id as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
  };
}

export class PostgresSessionsRepository {
  async list(client: PoolClient): Promise<SessionRecord[]> {
    const result = await client.query('select token, user_type, user_id, tenant_id, created_at, expires_at from sessions order by created_at desc');
    return result.rows.map((row) => mapSession(row));
  }

  async findByToken(client: PoolClient, token: string): Promise<SessionRecord | null> {
    const result = await client.query(
      'select token, user_type, user_id, tenant_id, created_at, expires_at from sessions where token = $1 limit 1',
      [token],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async deleteByToken(client: PoolClient, token: string): Promise<void> {
    await client.query('delete from sessions where token = $1', [token]);
  }

  async deleteByUser(client: PoolClient, userType: SessionRecord['userType'], userId: string): Promise<void> {
    await client.query('delete from sessions where user_type = $1 and user_id = $2', [userType, userId]);
  }

  async deleteExpired(client: PoolClient, nowIso: string): Promise<void> {
    await client.query('delete from sessions where expires_at <= $1', [nowIso]);
  }

  async upsertOne(client: PoolClient, item: SessionRecord): Promise<void> {
    await client.query(
      `insert into sessions(token, user_type, user_id, tenant_id, created_at, expires_at)
       values($1,$2,$3,$4,$5,$6)
       on conflict (token) do update set
         user_type = excluded.user_type,
         user_id = excluded.user_id,
         tenant_id = excluded.tenant_id,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
      [item.token, item.userType, item.userId, item.tenantId, item.createdAt, item.expiresAt],
    );
  }

  async upsertMany(client: PoolClient, items: SessionRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from sessions where token <> all($1::text[])', [ids]);
  }
}
