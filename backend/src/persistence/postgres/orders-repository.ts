import { PoolClient } from 'pg';

import { OrderRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

export class PostgresOrdersRepository {
  async list(client: PoolClient): Promise<OrderRecord[]> {
    const result = await client.query(`
      select id, restaurant_id, restaurant, customer, delivery_area, status, distance_km,
             estimated_km, estimated_minutes, driver_display_distance_km, driver_display_minutes, driver_display_mode, trip_earnings, company_charge, created_at,
             expires_at, assigned_driver_id, rejected_driver_ids, delivered_at,
             pending_dispatch_notification, events
      from orders
      order by created_at desc
    `);
    return result.rows.map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      restaurant: row.restaurant,
      customer: row.customer,
      deliveryArea: row.delivery_area,
      status: row.status,
      distanceKm: Number(row.distance_km),
      estimatedKm: Number(row.estimated_km),
      estimatedMinutes: row.estimated_minutes,
      driverDisplayDistanceKm: Number(row.driver_display_distance_km ?? row.estimated_km),
      driverDisplayMinutes: row.driver_display_minutes ?? row.estimated_minutes,
      driverDisplayMode: row.driver_display_mode ?? 'storeToCustomer',
      tripEarnings: Number(row.trip_earnings),
      companyCharge: Number(row.company_charge),
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      assignedDriverId: row.assigned_driver_id,
      rejectedDriverIds: row.rejected_driver_ids,
      deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
      pendingDispatchNotification: row.pending_dispatch_notification,
      events: row.events,
    }));
  }

  async upsertMany(client: PoolClient, items: OrderRecord[]): Promise<void> {
    for (const item of items) {
      await client.query(
        `insert into orders(id, restaurant_id, restaurant, customer, delivery_area, status, distance_km, estimated_km, estimated_minutes, driver_display_distance_km, driver_display_minutes, driver_display_mode, trip_earnings, company_charge, created_at, expires_at, assigned_driver_id, rejected_driver_ids, delivered_at, pending_dispatch_notification, events)
         values($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21::jsonb)
         on conflict (id) do update set
           restaurant_id = excluded.restaurant_id,
           restaurant = excluded.restaurant,
           customer = excluded.customer,
           delivery_area = excluded.delivery_area,
           status = excluded.status,
           distance_km = excluded.distance_km,
           estimated_km = excluded.estimated_km,
           estimated_minutes = excluded.estimated_minutes,
           driver_display_distance_km = excluded.driver_display_distance_km,
           driver_display_minutes = excluded.driver_display_minutes,
           driver_display_mode = excluded.driver_display_mode,
           trip_earnings = excluded.trip_earnings,
           company_charge = excluded.company_charge,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at,
           assigned_driver_id = excluded.assigned_driver_id,
           rejected_driver_ids = excluded.rejected_driver_ids,
           delivered_at = excluded.delivered_at,
           pending_dispatch_notification = excluded.pending_dispatch_notification,
           events = excluded.events`,
        [
          item.id,
          item.restaurantId,
          toJson(item.restaurant),
          toJson(item.customer),
          item.deliveryArea,
          item.status,
          item.distanceKm,
          item.estimatedKm,
          item.estimatedMinutes,
          item.driverDisplayDistanceKm,
          item.driverDisplayMinutes,
          item.driverDisplayMode,
          item.tripEarnings,
          item.companyCharge,
          item.createdAt,
          item.expiresAt,
          item.assignedDriverId,
          toJson(item.rejectedDriverIds),
          item.deliveredAt,
          item.pendingDispatchNotification,
          toJson(item.events),
        ],
      );
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from orders where id <> all($1::text[])', [ids]);
  }
}
