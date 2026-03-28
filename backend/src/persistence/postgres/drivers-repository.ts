import { PoolClient } from 'pg';

import { DriverRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

function mapDriver(row: Record<string, unknown>): DriverRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    email: row.email as string,
    password: row.password as string,
    rating: Number(row.rating),
    completedOrders: row.completed_orders as number,
    totalDistanceKm: Number(row.total_distance_km),
    isOnline: row.is_online as boolean,
    currentLocation: row.current_location as DriverRecord['currentLocation'],
    deviceToken: row.device_token as string | null,
    dispatchPolicy: row.dispatch_policy as DriverRecord['dispatchPolicy'],
    maxActiveOrders: row.max_active_orders as number,
  };
}

export class PostgresDriversRepository {
  async list(client: PoolClient): Promise<DriverRecord[]> {
    const result = await client.query(`
      select id, tenant_id, name, email, password, rating, completed_orders, total_distance_km,
             is_online, current_location, device_token, dispatch_policy, max_active_orders
      from drivers
      order by id
    `);
    return result.rows.map((row) => mapDriver(row));
  }

  async findByEmail(client: PoolClient, email: string): Promise<DriverRecord | null> {
    const result = await client.query(
      `select id, tenant_id, name, email, password, rating, completed_orders, total_distance_km,
              is_online, current_location, device_token, dispatch_policy, max_active_orders
       from drivers
       where email = $1
       limit 1`,
      [email],
    );
    return result.rows[0] ? mapDriver(result.rows[0]) : null;
  }

  async findById(client: PoolClient, driverId: string): Promise<DriverRecord | null> {
    const result = await client.query(
      `select id, tenant_id, name, email, password, rating, completed_orders, total_distance_km,
              is_online, current_location, device_token, dispatch_policy, max_active_orders
       from drivers
       where id = $1
       limit 1`,
      [driverId],
    );
    return result.rows[0] ? mapDriver(result.rows[0]) : null;
  }

  async countActiveLoad(client: PoolClient, driverId: string): Promise<number> {
    const result = await client.query(
      `select count(*)::int as count
       from orders
       where assigned_driver_id = $1 and status = any($2::text[])`,
      [driverId, ['pending', 'accepted', 'atRestaurant', 'pickedUp']],
    );
    return result.rows[0]?.count ?? 0;
  }

  async upsertOne(client: PoolClient, item: DriverRecord): Promise<void> {
    await client.query(
      `insert into drivers(id, tenant_id, name, email, password, rating, completed_orders, total_distance_km, is_online, current_location, device_token, dispatch_policy, max_active_orders)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13)
       on conflict (id) do update set
         tenant_id = excluded.tenant_id,
         name = excluded.name,
         email = excluded.email,
         password = excluded.password,
         rating = excluded.rating,
         completed_orders = excluded.completed_orders,
         total_distance_km = excluded.total_distance_km,
         is_online = excluded.is_online,
         current_location = excluded.current_location,
         device_token = excluded.device_token,
         dispatch_policy = excluded.dispatch_policy,
         max_active_orders = excluded.max_active_orders`,
      [
        item.id,
        item.tenantId,
        item.name,
        item.email,
        item.password,
        item.rating,
        item.completedOrders,
        item.totalDistanceKm,
        item.isOnline,
        toJson(item.currentLocation),
        item.deviceToken,
        toJson(item.dispatchPolicy),
        item.maxActiveOrders,
      ],
    );
  }

  async upsertMany(client: PoolClient, items: DriverRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from drivers where id <> all($1::text[])', [ids]);
  }
}
