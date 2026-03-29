import { PoolClient } from 'pg';

import { TenantRecord } from '../../domain/models.js';
import { defaultTenantCurrency, defaultTenantTimeZone, normalizeTenantCurrency, normalizeTenantTimeZone } from '../../utils/timezones.js';

function mapTenant(row: Record<string, unknown>): TenantRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    currency: normalizeTenantCurrency(row.currency ?? defaultTenantCurrency),
    timeZone: normalizeTenantTimeZone(row.time_zone ?? defaultTenantTimeZone),
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export class PostgresTenantsRepository {
  async list(client: PoolClient): Promise<TenantRecord[]> {
    const result = await client.query('select id, name, slug, currency, time_zone, is_active, created_at from tenants order by id');
    return result.rows.map((row) => mapTenant(row));
  }

  async findById(client: PoolClient, tenantId: string): Promise<TenantRecord | null> {
    const result = await client.query('select id, name, slug, currency, time_zone, is_active, created_at from tenants where id = $1 limit 1', [tenantId]);
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async findBySlug(client: PoolClient, slug: string): Promise<TenantRecord | null> {
    const result = await client.query('select id, name, slug, currency, time_zone, is_active, created_at from tenants where lower(slug) = lower($1) limit 1', [slug]);
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async upsertOne(client: PoolClient, item: TenantRecord): Promise<void> {
    await client.query(
      `insert into tenants(id, name, slug, currency, time_zone, is_active, created_at)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set
         name = excluded.name,
         slug = excluded.slug,
         currency = excluded.currency,
         time_zone = excluded.time_zone,
         is_active = excluded.is_active,
         created_at = excluded.created_at`,
      [item.id, item.name, item.slug, item.currency, item.timeZone, item.isActive, item.createdAt],
    );
  }

  async upsertMany(client: PoolClient, items: TenantRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from tenants where id <> all($1::text[])', [ids]);
  }
}
