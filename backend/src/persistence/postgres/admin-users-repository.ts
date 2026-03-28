import { PoolClient } from 'pg';

import { AdminUserRecord } from '../../domain/models.js';

function mapAdminUser(row: Record<string, unknown>): AdminUserRecord {
  return {
    id: row.id as string,
    tenantId: (row.tenant_id as string | null) ?? null,
    name: row.name as string,
    email: row.email as string,
    password: row.password as string,
    role: row.role as AdminUserRecord['role'],
    isActive: row.is_active as boolean,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string).toISOString() : null,
  };
}

export class PostgresAdminUsersRepository {
  async list(client: PoolClient): Promise<AdminUserRecord[]> {
    const result = await client.query(
      'select id, tenant_id, name, email, password, role, is_active, last_login_at from admin_users order by id',
    );
    return result.rows.map((row) => mapAdminUser(row));
  }

  async findById(client: PoolClient, adminUserId: string): Promise<AdminUserRecord | null> {
    const result = await client.query(
      'select id, tenant_id, name, email, password, role, is_active, last_login_at from admin_users where id = $1 limit 1',
      [adminUserId],
    );
    return result.rows[0] ? mapAdminUser(result.rows[0]) : null;
  }

  async findByEmail(client: PoolClient, email: string): Promise<AdminUserRecord | null> {
    const result = await client.query(
      'select id, tenant_id, name, email, password, role, is_active, last_login_at from admin_users where lower(email) = lower($1) limit 1',
      [email],
    );
    return result.rows[0] ? mapAdminUser(result.rows[0]) : null;
  }

  async upsertOne(client: PoolClient, item: AdminUserRecord): Promise<void> {
    await client.query(
      `insert into admin_users(id, tenant_id, name, email, password, role, is_active, last_login_at)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
         tenant_id = excluded.tenant_id,
         name = excluded.name,
         email = excluded.email,
         password = excluded.password,
         role = excluded.role,
         is_active = excluded.is_active,
         last_login_at = excluded.last_login_at`,
      [item.id, item.tenantId, item.name, item.email, item.password, item.role, item.isActive, item.lastLoginAt],
    );
  }

  async upsertMany(client: PoolClient, items: AdminUserRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from admin_users where id <> all($1::text[])', [ids]);
  }
}
