import { PoolClient } from 'pg';

import { MerchantRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

function mapMerchant(row: Record<string, unknown>): MerchantRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    users: (row.users as MerchantRecord['users'] | null) ?? [],
  };
}

export class PostgresMerchantsRepository {
  async list(client: PoolClient): Promise<MerchantRecord[]> {
    const result = await client.query('select id, tenant_id, name, users from merchants order by id');
    return result.rows.map((row) => mapMerchant(row));
  }

  async findById(client: PoolClient, merchantId: string): Promise<MerchantRecord | null> {
    const result = await client.query('select id, tenant_id, name, users from merchants where id = $1 limit 1', [merchantId]);
    return result.rows[0] ? mapMerchant(result.rows[0]) : null;
  }

  async findByUserEmail(client: PoolClient, email: string): Promise<MerchantRecord | null> {
    const result = await client.query(
      `select id, tenant_id, name, users
       from merchants
       where exists (
         select 1
         from jsonb_array_elements(users) as user_item
         where lower(user_item ->> 'email') = lower($1)
       )
       limit 1`,
      [email],
    );
    return result.rows[0] ? mapMerchant(result.rows[0]) : null;
  }

  async upsertOne(client: PoolClient, item: MerchantRecord): Promise<void> {
    await client.query(
      'insert into merchants(id, tenant_id, name, users) values($1, $2, $3, $4::jsonb) on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name, users = excluded.users',
      [item.id, item.tenantId, item.name, toJson(item.users)],
    );
  }

  async upsertMany(client: PoolClient, items: MerchantRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from merchants where id <> all($1::text[])', [ids]);
  }
}
