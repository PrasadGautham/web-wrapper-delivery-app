import { PoolClient } from 'pg';

import { RestaurantRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

function mapRestaurant(row: Record<string, unknown>): RestaurantRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    merchantId: row.merchant_id as string,
    name: row.name as string,
    email: row.email as string,
    password: row.password as string,
    pickupLocation: row.pickup_location as RestaurantRecord['pickupLocation'],
    pricing: {
      driverPayoutRule: row.driver_payout_rule as RestaurantRecord['pricing']['driverPayoutRule'],
      merchantBillingRule: row.merchant_billing_rule as RestaurantRecord['pricing']['merchantBillingRule'],
    },
    currency: row.currency as string,
    distanceUnit: (row.distance_unit as RestaurantRecord['distanceUnit'] | null) ?? 'kilometer',
    trackingSettings: row.tracking_settings as RestaurantRecord['trackingSettings'],
    driverOfferSettings: (row.driver_offer_settings as RestaurantRecord['driverOfferSettings'] | null) ?? { distanceMode: 'storeToCustomer' },
    staffUsers: (row.staff_users as RestaurantRecord['staffUsers'] | null) ?? [],
  };
}

const baseSelect = `select id, tenant_id, merchant_id, name, email, password, pickup_location,
                           driver_payout_rule, merchant_billing_rule, currency, distance_unit, tracking_settings, driver_offer_settings, staff_users
                    from restaurants`;

export class PostgresRestaurantsRepository {
  async list(client: PoolClient): Promise<RestaurantRecord[]> {
    const result = await client.query(`${baseSelect} order by id`);
    return result.rows.map((row) => mapRestaurant(row));
  }

  async findByEmail(client: PoolClient, email: string): Promise<RestaurantRecord | null> {
    const result = await client.query(`${baseSelect} where lower(email) = lower($1) limit 1`, [email]);
    return result.rows[0] ? mapRestaurant(result.rows[0]) : null;
  }

  async findByStaffEmail(client: PoolClient, email: string): Promise<RestaurantRecord | null> {
    const result = await client.query(
      `${baseSelect}
       where exists (
         select 1
         from jsonb_array_elements(staff_users) as user_item
         where lower(user_item ->> 'email') = lower($1)
       )
       limit 1`,
      [email],
    );
    return result.rows[0] ? mapRestaurant(result.rows[0]) : null;
  }

  async findById(client: PoolClient, restaurantId: string): Promise<RestaurantRecord | null> {
    const result = await client.query(`${baseSelect} where id = $1 limit 1`, [restaurantId]);
    return result.rows[0] ? mapRestaurant(result.rows[0]) : null;
  }

  async upsertOne(client: PoolClient, item: RestaurantRecord): Promise<void> {
    await client.query(
      `insert into restaurants(id, tenant_id, merchant_id, name, email, password, pickup_location, driver_payout_rule, merchant_billing_rule, currency, distance_unit, tracking_settings, driver_offer_settings, staff_users)
       values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb)
       on conflict (id) do update set
         tenant_id = excluded.tenant_id,
         merchant_id = excluded.merchant_id,
         name = excluded.name,
         email = excluded.email,
         password = excluded.password,
         pickup_location = excluded.pickup_location,
         driver_payout_rule = excluded.driver_payout_rule,
         merchant_billing_rule = excluded.merchant_billing_rule,
         currency = excluded.currency,
         distance_unit = excluded.distance_unit,
         tracking_settings = excluded.tracking_settings,
         driver_offer_settings = excluded.driver_offer_settings,
         staff_users = excluded.staff_users`,
      [
        item.id,
        item.tenantId,
        item.merchantId,
        item.name,
        item.email,
        item.password,
        toJson(item.pickupLocation),
        toJson(item.pricing.driverPayoutRule),
        toJson(item.pricing.merchantBillingRule),
        item.currency,
        item.distanceUnit ?? 'kilometer',
        toJson(item.trackingSettings),
        toJson(item.driverOfferSettings ?? { distanceMode: 'storeToCustomer' }),
        toJson(item.staffUsers ?? []),
      ],
    );
  }

  async upsertMany(client: PoolClient, items: RestaurantRecord[]): Promise<void> {
    for (const item of items) {
      await this.upsertOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from restaurants where id <> all($1::text[])', [ids]);
  }
}
