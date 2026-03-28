create table if not exists merchants (
  id text primary key,
  name text not null,
  users jsonb not null default '[]'::jsonb
);

create table if not exists drivers (
  id text primary key,
  name text not null,
  email text not null unique,
  password text not null,
  rating double precision not null,
  completed_orders integer not null,
  total_distance_km double precision not null,
  is_online boolean not null,
  current_location jsonb not null,
  device_token text,
  dispatch_policy jsonb not null,
  max_active_orders integer not null
);

create table if not exists restaurants (
  id text primary key,
  merchant_id text not null references merchants(id) on delete cascade,
  name text not null,
  email text not null unique,
  password text not null,
  pickup_location jsonb not null,
  driver_payout_rule jsonb not null,
  merchant_billing_rule jsonb not null,
  currency text not null,
  tracking_settings jsonb not null,
  staff_users jsonb not null default '[]'::jsonb
);

create table if not exists admin_users (
  id text primary key,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null,
  is_active boolean not null,
  last_login_at timestamptz
);

create table if not exists orders (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  restaurant jsonb not null,
  customer jsonb not null,
  delivery_area text not null,
  status text not null,
  distance_km double precision not null,
  estimated_km double precision not null,
  estimated_minutes integer not null,
  trip_earnings double precision not null,
  company_charge double precision not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  assigned_driver_id text references drivers(id) on delete set null,
  rejected_driver_ids jsonb not null,
  delivered_at timestamptz,
  pending_dispatch_notification boolean not null,
  events jsonb not null
);

create table if not exists sessions (
  token text primary key,
  user_type text not null,
  user_id text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists password_reset_tokens (
  id text primary key,
  user_type text not null,
  user_id text not null,
  token_hash text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists audit_logs (
  id text primary key,
  at timestamptz not null,
  actor_type text not null,
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb
);

create index if not exists idx_orders_restaurant_id on orders(restaurant_id);
create index if not exists idx_orders_assigned_driver_id on orders(assigned_driver_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_sessions_expires_at on sessions(expires_at);
create index if not exists idx_password_reset_tokens_expires_at on password_reset_tokens(expires_at);
create index if not exists idx_audit_logs_at on audit_logs(at desc);

