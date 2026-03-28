import { PoolClient } from 'pg';

import { PasswordResetTokenRecord } from '../../domain/models.js';

function mapPasswordResetToken(row: Record<string, unknown>): PasswordResetTokenRecord {
  return {
    id: row.id as string,
    userType: row.user_type as PasswordResetTokenRecord['userType'],
    userId: row.user_id as string,
    tenantId: (row.tenant_id as string | null) ?? null,
    tokenHash: row.token_hash as string,
    createdAt: (row.created_at as Date).toISOString(),
    expiresAt: (row.expires_at as Date).toISOString(),
  };
}

export class PostgresPasswordResetTokensRepository {
  async list(client: PoolClient): Promise<PasswordResetTokenRecord[]> {
    const result = await client.query(
      'select id, user_type, user_id, tenant_id, token_hash, created_at, expires_at from password_reset_tokens order by created_at desc',
    );
    return result.rows.map((row) => mapPasswordResetToken(row));
  }

  async findByHash(client: PoolClient, tokenHash: string, userType: PasswordResetTokenRecord['userType']): Promise<PasswordResetTokenRecord | null> {
    const result = await client.query(
      'select id, user_type, user_id, tenant_id, token_hash, created_at, expires_at from password_reset_tokens where token_hash = $1 and user_type = $2 limit 1',
      [tokenHash, userType],
    );
    return result.rows[0] ? mapPasswordResetToken(result.rows[0]) : null;
  }

  async upsertOne(client: PoolClient, item: PasswordResetTokenRecord): Promise<void> {
    await client.query(
      `insert into password_reset_tokens(id, user_type, user_id, tenant_id, token_hash, created_at, expires_at)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set
         user_type = excluded.user_type,
         user_id = excluded.user_id,
         tenant_id = excluded.tenant_id,
         token_hash = excluded.token_hash,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
      [item.id, item.userType, item.userId, item.tenantId, item.tokenHash, item.createdAt, item.expiresAt],
    );
  }

  async deleteById(client: PoolClient, id: string): Promise<void> {
    await client.query('delete from password_reset_tokens where id = $1', [id]);
  }

  async deleteByUser(client: PoolClient, userType: PasswordResetTokenRecord['userType'], userId: string): Promise<void> {
    await client.query('delete from password_reset_tokens where user_type = $1 and user_id = $2', [userType, userId]);
  }

  async deleteExpired(client: PoolClient, nowIso: string): Promise<void> {
    await client.query('delete from password_reset_tokens where expires_at <= $1', [nowIso]);
  }

  async upsertMany(client: PoolClient, items: PasswordResetTokenRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from password_reset_tokens where id <> all($1::text[])', [ids]);
  }
}
