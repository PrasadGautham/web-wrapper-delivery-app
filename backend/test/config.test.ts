import assert from 'node:assert/strict';

import { loadAppConfig } from '../src/config/app-config.js';

export async function runConfigTests(): Promise<void> {
  {
    const config = loadAppConfig({});
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 8080);
    assert.equal(config.dispatchIntervalMs, 5000);
    assert.equal(config.allowAdminApiKeyFallback, false);
    assert.deepEqual(config.allowedWebOrigins, []);
    assert.equal(config.metricsApiKey, null);
    assert.equal(config.webSessionCookieSecure, false);
    assert.equal(config.webSessionCookieSameSite, 'Strict');
  }

  {
    const config = loadAppConfig({
      PORT: '9090',
      SESSION_TTL_HOURS: '24',
      STALE_LOCATION_MINUTES: '7',
      DISPATCH_INTERVAL_MS: '3000',
      DATABASE_URL: 'postgres://demo',
      ALLOW_ADMIN_API_KEY_FALLBACK: 'true',
      ALLOWED_WEB_ORIGINS: 'https://ops.example.com, https://merchant.example.com',
      METRICS_API_KEY: 'metrics-secret',
      WEB_SESSION_COOKIE_SECURE: 'true',
      WEB_SESSION_COOKIE_SAME_SITE: 'none',
      WEB_SESSION_COOKIE_DOMAIN: '.example.com',
      WEB_SESSION_COOKIE_MAX_AGE_SECONDS: '7200',
    });
    assert.equal(config.port, 9090);
    assert.equal(config.sessionTtlHours, 24);
    assert.equal(config.staleLocationMinutes, 7);
    assert.equal(config.dispatchIntervalMs, 3000);
    assert.equal(config.databaseUrl, 'postgres://demo');
    assert.equal(config.allowAdminApiKeyFallback, true);
    assert.deepEqual(config.allowedWebOrigins, ['https://ops.example.com', 'https://merchant.example.com']);
    assert.equal(config.metricsApiKey, 'metrics-secret');
    assert.equal(config.webSessionCookieSecure, true);
    assert.equal(config.webSessionCookieSameSite, 'None');
    assert.equal(config.webSessionCookieDomain, '.example.com');
    assert.equal(config.webSessionCookieMaxAgeSeconds, 7200);
  }

  await assert.rejects(async () => loadAppConfig({ PORT: '70000' }), /PORT must be 65535 or lower/);
  await assert.rejects(async () => loadAppConfig({ SESSION_TTL_HOURS: '0' }), /SESSION_TTL_HOURS must be a positive integer/);
  await assert.rejects(async () => loadAppConfig({ ALLOW_ADMIN_API_KEY_FALLBACK: 'yes' }), /ALLOW_ADMIN_API_KEY_FALLBACK values must be true or false/);
  await assert.rejects(async () => loadAppConfig({ WEB_SESSION_COOKIE_SAME_SITE: 'None', WEB_SESSION_COOKIE_SECURE: 'false' }), /WEB_SESSION_COOKIE_SECURE must be true when WEB_SESSION_COOKIE_SAME_SITE=None/);
}
