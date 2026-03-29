import { readFile } from 'node:fs/promises';

import { Pool, PoolClient } from 'pg';

import { DatabaseShape } from '../domain/models.js';
import { PostgresAdminUsersRepository } from '../persistence/postgres/admin-users-repository.js';
import { PostgresAuditLogsRepository } from '../persistence/postgres/audit-logs-repository.js';
import { PostgresDriversRepository } from '../persistence/postgres/drivers-repository.js';
import { PostgresDriverTripsRepository } from '../persistence/postgres/driver-trips-repository.js';
import { PostgresMerchantsRepository } from '../persistence/postgres/merchants-repository.js';
import { PostgresOrdersRepository } from '../persistence/postgres/orders-repository.js';
import { PostgresPasswordResetTokensRepository } from '../persistence/postgres/password-reset-tokens-repository.js';
import { PostgresRestaurantsRepository } from '../persistence/postgres/restaurants-repository.js';
import { PostgresSessionsRepository } from '../persistence/postgres/sessions-repository.js';
import { PostgresTenantsRepository } from '../persistence/postgres/tenants-repository.js';
import {
  OperationalStateContext,
  OperationalStateStoreContract,
  StoreContract,
  WorkflowStoreContext,
  WorkflowStoreContract,
} from './store-contract.js';

export class PostgresStore implements StoreContract, WorkflowStoreContract, OperationalStateStoreContract {
  private readonly pool: Pool;
  private readonly tenantsRepository = new PostgresTenantsRepository();
  private readonly merchantsRepository = new PostgresMerchantsRepository();
  private readonly driversRepository = new PostgresDriversRepository();
  private readonly driverTripsRepository = new PostgresDriverTripsRepository();
  private readonly restaurantsRepository = new PostgresRestaurantsRepository();
  private readonly adminUsersRepository = new PostgresAdminUsersRepository();
  private readonly ordersRepository = new PostgresOrdersRepository();
  private readonly sessionsRepository = new PostgresSessionsRepository();
  private readonly passwordResetTokensRepository = new PostgresPasswordResetTokensRepository();
  private readonly auditLogsRepository = new PostgresAuditLogsRepository();
  private initialized = false;

  constructor(private readonly connectionString: string, private readonly schemaFilePath: string) {
    this.pool = new Pool({ connectionString: this.connectionString });
  }

  async read(): Promise<DatabaseShape> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      const tenants = await this.tenantsRepository.list(client);
      const merchants = await this.merchantsRepository.list(client);
      const drivers = await this.driversRepository.list(client);
      const driverTrips = await this.driverTripsRepository.list(client);
      const restaurants = await this.restaurantsRepository.list(client);
      const adminUsers = await this.adminUsersRepository.list(client);
      const orders = await this.ordersRepository.list(client);
      const sessions = await this.sessionsRepository.list(client);
      const passwordResetTokens = await this.passwordResetTokensRepository.list(client);
      const auditLogs = await this.auditLogsRepository.list(client);

      return {
        tenants,
        merchants,
        drivers,
        driverTrips,
        restaurants,
        adminUsers,
        orders,
        sessions,
        passwordResetTokens,
        auditLogs,
      };
    } finally {
      client.release();
    }
  }

  async write(data: DatabaseShape): Promise<void> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      await this.tenantsRepository.upsertMany(client, data.tenants ?? []);
      await this.merchantsRepository.upsertMany(client, data.merchants);
      await this.driversRepository.upsertMany(client, data.drivers);
      await this.driverTripsRepository.upsertMany(client, data.driverTrips ?? []);
      await this.restaurantsRepository.upsertMany(client, data.restaurants);
      await this.adminUsersRepository.upsertMany(client, data.adminUsers ?? []);
      await this.ordersRepository.upsertMany(client, data.orders);
      await this.sessionsRepository.upsertMany(client, data.sessions);
      await this.passwordResetTokensRepository.upsertMany(client, data.passwordResetTokens ?? []);
      await this.auditLogsRepository.upsertMany(client, data.auditLogs);

      await this.ordersRepository.deleteMissing(client, data.orders.map((item) => item.id));
      await this.driverTripsRepository.deleteMissing(client, (data.driverTrips ?? []).map((item) => item.id));
      await this.restaurantsRepository.deleteMissing(client, data.restaurants.map((item) => item.id));
      await this.merchantsRepository.deleteMissing(client, data.merchants.map((item) => item.id));
      await this.driversRepository.deleteMissing(client, data.drivers.map((item) => item.id));
      await this.adminUsersRepository.deleteMissing(client, (data.adminUsers ?? []).map((item) => item.id));
      await this.sessionsRepository.deleteMissing(client, data.sessions.map((item) => item.token));
      await this.passwordResetTokensRepository.deleteMissing(client, (data.passwordResetTokens ?? []).map((item) => item.id));
      await this.auditLogsRepository.deleteMissing(client, data.auditLogs.map((item) => item.id));
      await this.tenantsRepository.deleteMissing(client, (data.tenants ?? []).map((item) => item.id));

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async withWorkflowReadContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      return callback(this.createWorkflowContext(client));
    } finally {
      client.release();
    }
  }

  async withWorkflowWriteContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await callback(this.createWorkflowContext(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async withOperationalReadContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      return callback(await this.createOperationalContext(client));
    } finally {
      client.release();
    }
  }

  async withOperationalWriteContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const context = await this.createOperationalContext(client);
      const result = await callback(context);
      await this.driversRepository.upsertMany(client, context.state.drivers);
      await this.driverTripsRepository.upsertMany(client, context.state.driverTrips);
      await this.restaurantsRepository.upsertMany(client, context.state.restaurants);
      await this.ordersRepository.upsertMany(client, context.state.orders);
      await this.ordersRepository.deleteMissing(client, context.state.orders.map((item) => item.id));
      await this.driverTripsRepository.deleteMissing(client, context.state.driverTrips.map((item) => item.id));
      await this.restaurantsRepository.deleteMissing(client, context.state.restaurants.map((item) => item.id));
      await this.driversRepository.deleteMissing(client, context.state.drivers.map((item) => item.id));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createOperationalContext(client: PoolClient): Promise<OperationalStateContext> {
    const drivers = await this.driversRepository.list(client);
    const driverTrips = await this.driverTripsRepository.list(client);
    const restaurants = await this.restaurantsRepository.list(client);
    const orders = await this.ordersRepository.list(client);

    return {
      state: { drivers, driverTrips, restaurants, orders },
      appendAuditLog: (log) => this.auditLogsRepository.appendOne(client, log),
    };
  }

  private createWorkflowContext(client: PoolClient): WorkflowStoreContext {
    return {
      listTenants: () => this.tenantsRepository.list(client),
      findTenantById: (tenantId) => this.tenantsRepository.findById(client, tenantId),
      findTenantBySlug: (slug) => this.tenantsRepository.findBySlug(client, slug),
      saveTenant: (tenant) => this.tenantsRepository.upsertOne(client, tenant),
      findDriverByEmail: (email) => this.driversRepository.findByEmail(client, email),
      findDriverById: (driverId) => this.driversRepository.findById(client, driverId),
      countDriverActiveLoad: (driverId) => this.driversRepository.countActiveLoad(client, driverId),
      saveDriver: (driver) => this.driversRepository.upsertOne(client, driver),
      findRestaurantByEmail: (email) => this.restaurantsRepository.findByEmail(client, email),
      findRestaurantByStaffEmail: (email) => this.restaurantsRepository.findByStaffEmail(client, email),
      findRestaurantById: (restaurantId) => this.restaurantsRepository.findById(client, restaurantId),
      saveRestaurant: (restaurant) => this.restaurantsRepository.upsertOne(client, restaurant),
      findMerchantById: (merchantId) => this.merchantsRepository.findById(client, merchantId),
      findMerchantByUserEmail: (email) => this.merchantsRepository.findByUserEmail(client, email),
      saveMerchant: (merchant) => this.merchantsRepository.upsertOne(client, merchant),
      findAdminUserByEmail: (email) => this.adminUsersRepository.findByEmail(client, email),
      findAdminUserById: (adminUserId) => this.adminUsersRepository.findById(client, adminUserId),
      saveAdminUser: (adminUser) => this.adminUsersRepository.upsertOne(client, adminUser),
      findSessionByToken: (token) => this.sessionsRepository.findByToken(client, token),
      replaceSession: async (session) => {
        await this.sessionsRepository.deleteByUser(client, session.userType, session.userId);
        await this.sessionsRepository.upsertOne(client, session);
      },
      deleteSession: (token) => this.sessionsRepository.deleteByToken(client, token),
      deleteSessionsForUser: (userType, userId) => this.sessionsRepository.deleteByUser(client, userType, userId),
      deleteExpiredSessions: (nowIso) => this.sessionsRepository.deleteExpired(client, nowIso),
      findPasswordResetTokenByHash: (tokenHash, userType) => this.passwordResetTokensRepository.findByHash(client, tokenHash, userType),
      savePasswordResetToken: (record) => this.passwordResetTokensRepository.upsertOne(client, record),
      deletePasswordResetToken: (id) => this.passwordResetTokensRepository.deleteById(client, id),
      deletePasswordResetTokensForUser: (userType, userId) => this.passwordResetTokensRepository.deleteByUser(client, userType, userId),
      deleteExpiredPasswordResetTokens: (nowIso) => this.passwordResetTokensRepository.deleteExpired(client, nowIso),
      appendAuditLog: (log) => this.auditLogsRepository.appendOne(client, log),
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const schema = await readFile(this.schemaFilePath, 'utf8');
    await this.pool.query(schema);
    await this.assertTenantIntegrity();
    this.initialized = true;
  }

  private async assertTenantIntegrity(): Promise<void> {
    const result = await this.pool.query(`
      select
        (select count(*)::int from tenants) as tenants,
        (select count(*)::int from merchants where tenant_id is null) as merchants_missing_tenant,
        (select count(*)::int from drivers where tenant_id is null) as drivers_missing_tenant,
        (select count(*)::int from driver_trips where tenant_id is null or driver_id is null) as driver_trips_missing_scope,
        (select count(*)::int from restaurants where tenant_id is null) as restaurants_missing_tenant,
        (select count(*)::int from orders where tenant_id is null) as orders_missing_tenant,
        (select count(*)::int from admin_users where role like 'tenant%' and tenant_id is null) as tenant_admins_missing_tenant,
        (select count(*)::int from admin_users where role in ('platformAdmin', 'opsAdmin', 'supportAdmin', 'billingAdmin') and tenant_id is not null) as platform_admins_with_tenant,
        (select count(*)::int from admin_users where role in ('tenantAdmin', 'tenantOps', 'tenantSupport') and tenant_id is null) as tenant_admins_without_tenant,
        (select count(*)::int from admin_users where role not in ('platformAdmin', 'opsAdmin', 'supportAdmin', 'billingAdmin', 'tenantAdmin', 'tenantOps', 'tenantSupport')) as unknown_admin_roles,
        (select count(*)::int from merchants) as merchant_count,
        (select count(*)::int from drivers) as driver_count,
        (select count(*)::int from driver_trips) as driver_trip_count,
        (select count(*)::int from restaurants) as restaurant_count,
        (select count(*)::int from orders) as order_count
    `);

    const row = result.rows[0] as Record<string, number>;
    const tenantOwnedRows = Number(row.merchant_count ?? 0) + Number(row.driver_count ?? 0) + Number(row.driver_trip_count ?? 0) + Number(row.restaurant_count ?? 0) + Number(row.order_count ?? 0);
    const hasBrokenTenantState =
      (Number(row.tenants ?? 0) === 0 && tenantOwnedRows > 0) ||
      Number(row.merchants_missing_tenant ?? 0) > 0 ||
      Number(row.drivers_missing_tenant ?? 0) > 0 ||
      Number(row.driver_trips_missing_scope ?? 0) > 0 ||
      Number(row.restaurants_missing_tenant ?? 0) > 0 ||
      Number(row.orders_missing_tenant ?? 0) > 0 ||
      Number(row.tenant_admins_missing_tenant ?? 0) > 0 ||
      Number(row.platform_admins_with_tenant ?? 0) > 0 ||
      Number(row.tenant_admins_without_tenant ?? 0) > 0 ||
      Number(row.unknown_admin_roles ?? 0) > 0;

    if (hasBrokenTenantState) {
      throw new Error('Postgres tenant integrity check failed. Tenant-owned rows must have tenant_id values, platform admins must stay global, and tenant admins must be scoped to exactly one tenant. Reset the local database with backend/reset-local-postgres.ps1 before starting the backend.');
    }
  }
}
