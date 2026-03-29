import { PoolClient } from 'pg';

import { DriverTripRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

export class PostgresDriverTripsRepository {
  async list(client: PoolClient): Promise<DriverTripRecord[]> {
    const result = await client.query(`
      select id, tenant_id, driver_id, status, started_at, completed_at, order_ids, restaurant_ids
      from driver_trips
      order by started_at desc
    `);
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      driverId: row.driver_id,
      status: row.status,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      orderIds: row.order_ids ?? [],
      restaurantIds: row.restaurant_ids ?? [],
    }));
  }

  async upsertMany(client: PoolClient, items: DriverTripRecord[]): Promise<void> {
    for (const item of items) {
      await client.query(
        `insert into driver_trips(id, tenant_id, driver_id, status, started_at, completed_at, order_ids, restaurant_ids)
         values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
         on conflict (id) do update set
           tenant_id = excluded.tenant_id,
           driver_id = excluded.driver_id,
           status = excluded.status,
           started_at = excluded.started_at,
           completed_at = excluded.completed_at,
           order_ids = excluded.order_ids,
           restaurant_ids = excluded.restaurant_ids`,
        [
          item.id,
          item.tenantId,
          item.driverId,
          item.status,
          item.startedAt,
          item.completedAt,
          toJson(item.orderIds),
          toJson(item.restaurantIds),
        ],
      );
    }
  }

  async upsertOne(client: PoolClient, item: DriverTripRecord): Promise<void> {
    await this.upsertMany(client, [item]);
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from driver_trips where id <> all($1::text[])', [ids]);
  }
}
