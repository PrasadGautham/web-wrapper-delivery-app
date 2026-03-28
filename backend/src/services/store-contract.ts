import {
  AdminUserRecord,
  AuditLogRecord,
  DatabaseShape,
  DriverRecord,
  TenantRecord,
  MerchantRecord,
  OrderRecord,
  PasswordResetTokenRecord,
  RestaurantRecord,
  SessionRecord,
  UserType,
} from '../domain/models.js';

export interface WorkflowStoreContext {
  listTenants(): Promise<TenantRecord[]>;
  findTenantById(tenantId: string): Promise<TenantRecord | null>;
  findTenantBySlug(slug: string): Promise<TenantRecord | null>;
  saveTenant(tenant: TenantRecord): Promise<void>;
  findDriverByEmail(email: string): Promise<DriverRecord | null>;
  findDriverById(driverId: string): Promise<DriverRecord | null>;
  countDriverActiveLoad(driverId: string): Promise<number>;
  saveDriver(driver: DriverRecord): Promise<void>;
  findRestaurantByEmail(email: string): Promise<RestaurantRecord | null>;
  findRestaurantByStaffEmail(email: string): Promise<RestaurantRecord | null>;
  findRestaurantById(restaurantId: string): Promise<RestaurantRecord | null>;
  saveRestaurant(restaurant: RestaurantRecord): Promise<void>;
  findMerchantById(merchantId: string): Promise<MerchantRecord | null>;
  findMerchantByUserEmail(email: string): Promise<MerchantRecord | null>;
  saveMerchant(merchant: MerchantRecord): Promise<void>;
  findAdminUserByEmail(email: string): Promise<AdminUserRecord | null>;
  findAdminUserById(adminUserId: string): Promise<AdminUserRecord | null>;
  saveAdminUser(adminUser: AdminUserRecord): Promise<void>;
  findSessionByToken(token: string): Promise<SessionRecord | null>;
  replaceSession(session: SessionRecord): Promise<void>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsForUser(userType: UserType, userId: string): Promise<void>;
  deleteExpiredSessions(nowIso: string): Promise<void>;
  findPasswordResetTokenByHash(tokenHash: string, userType: UserType): Promise<PasswordResetTokenRecord | null>;
  savePasswordResetToken(record: PasswordResetTokenRecord): Promise<void>;
  deletePasswordResetToken(id: string): Promise<void>;
  deletePasswordResetTokensForUser(userType: UserType, userId: string): Promise<void>;
  deleteExpiredPasswordResetTokens(nowIso: string): Promise<void>;
  appendAuditLog(log: AuditLogRecord): Promise<void>;
}

export interface WorkflowStoreContract {
  withWorkflowReadContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T>;
  withWorkflowWriteContext<T>(callback: (context: WorkflowStoreContext) => Promise<T> | T): Promise<T>;
}

export interface OperationalState {
  drivers: DriverRecord[];
  restaurants: RestaurantRecord[];
  orders: OrderRecord[];
}

export interface OperationalStateContext {
  state: OperationalState;
  appendAuditLog(log: AuditLogRecord): Promise<void>;
}

export interface OperationalStateStoreContract {
  withOperationalReadContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T>;
  withOperationalWriteContext<T>(callback: (context: OperationalStateContext) => Promise<T> | T): Promise<T>;
}

export interface StoreContract {
  read(): Promise<DatabaseShape>;
  write(data: DatabaseShape): Promise<void>;
}

export function hasWorkflowStore(store: StoreContract): store is StoreContract & WorkflowStoreContract {
  return 'withWorkflowReadContext' in store && 'withWorkflowWriteContext' in store;
}

export function hasOperationalStateStore(
  store: StoreContract,
): store is StoreContract & OperationalStateStoreContract {
  return 'withOperationalReadContext' in store && 'withOperationalWriteContext' in store;
}
