export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string | null;
  googleMapsApiKey: string | null;
  firebaseServiceAccountPath: string | null;
  adminApiKey: string | null;
  allowAdminApiKeyFallback: boolean;
  allowedWebOrigins: string[];
  metricsApiKey: string | null;
  redisUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFromEmail: string | null;
  passwordResetBaseUrl: string | null;
  alertWebhookUrl: string | null;
  alertMinIntervalSeconds: number;
  sessionTtlHours: number;
  staleLocationMinutes: number;
  dispatchIntervalMs: number;
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readOptionalPort(value: string | undefined, name: string): number | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error('Boolean configuration values must be true or false.');
}

function readStringList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = readPositiveInteger(env.PORT, 8080, 'PORT');
  if (port > 65535) {
    throw new Error('PORT must be 65535 or lower.');
  }

  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port,
    databaseUrl: readOptionalString(env.DATABASE_URL),
    googleMapsApiKey: readOptionalString(env.GOOGLE_MAPS_API_KEY),
    firebaseServiceAccountPath: readOptionalString(env.FIREBASE_SERVICE_ACCOUNT_PATH),
    adminApiKey: readOptionalString(env.ADMIN_API_KEY),
    allowAdminApiKeyFallback: readBoolean(env.ALLOW_ADMIN_API_KEY_FALLBACK, false),
    allowedWebOrigins: readStringList(env.ALLOWED_WEB_ORIGINS),
    metricsApiKey: readOptionalString(env.METRICS_API_KEY),
    redisUrl: readOptionalString(env.REDIS_URL),
    smtpHost: readOptionalString(env.SMTP_HOST),
    smtpPort: readOptionalPort(env.SMTP_PORT, 'SMTP_PORT'),
    smtpUser: readOptionalString(env.SMTP_USER),
    smtpPassword: readOptionalString(env.SMTP_PASSWORD),
    smtpFromEmail: readOptionalString(env.SMTP_FROM_EMAIL),
    passwordResetBaseUrl: readOptionalString(env.PASSWORD_RESET_BASE_URL),
    alertWebhookUrl: readOptionalString(env.ALERT_WEBHOOK_URL),
    alertMinIntervalSeconds: readPositiveInteger(
      env.ALERT_MIN_INTERVAL_SECONDS,
      300,
      'ALERT_MIN_INTERVAL_SECONDS',
    ),
    sessionTtlHours: readPositiveInteger(env.SESSION_TTL_HOURS, 12, 'SESSION_TTL_HOURS'),
    staleLocationMinutes: readPositiveInteger(env.STALE_LOCATION_MINUTES, 5, 'STALE_LOCATION_MINUTES'),
    dispatchIntervalMs: readPositiveInteger(env.DISPATCH_INTERVAL_MS, 5000, 'DISPATCH_INTERVAL_MS'),
  };
}
