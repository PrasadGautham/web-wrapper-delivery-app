import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/app.js';
import { loadAppConfig } from '../src/config/app-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

function ensureStaticTestFiles(): void {
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(path.join(publicDir, 'platform-admin.html'), '<!doctype html><html><body>platform-admin</body></html>');
  writeFileSync(path.join(publicDir, 'tenant-admin.html'), '<!doctype html><html><body>tenant-admin</body></html>');
  writeFileSync(path.join(publicDir, 'merchant.html'), '<!doctype html><html><body>merchant</body></html>');
  writeFileSync(path.join(publicDir, 'restaurant.html'), '<!doctype html><html><body>restaurant</body></html>');
}

export async function runOpsSurfaceTests(): Promise<void> {
  ensureStaticTestFiles();
  process.env.WEB_SESSION_COOKIE_SECURE = 'false';
  process.env.WEB_SESSION_COOKIE_SAME_SITE = 'Strict';
  process.env.CSP_REPORT_ONLY = 'true';
  process.env.CSP_REPORT_URI = '/api/security/csp-report';
  process.env.METRICS_API_KEY = 'metrics-secret';
  process.env.ALLOWED_WEB_ORIGINS = 'http://127.0.0.1:8080';
  delete process.env.DATABASE_URL;

  const { app } = await buildApp(loadAppConfig(process.env));
  try {
    const adminPage = await app.inject({ method: 'GET', url: '/platform-admin' });
    assert.equal(adminPage.statusCode, 200);
    assert.ok(adminPage.headers['content-security-policy-report-only']);
    assert.match(String(adminPage.headers['content-security-policy-report-only']), /report-uri \/api\/security\/csp-report/);
    assert.match(String(adminPage.headers['reporting-endpoints']), /csp-endpoint/);
    assert.equal(adminPage.headers['cache-control'], 'no-store');

    const metricsUnauthorized = await app.inject({ method: 'GET', url: '/api/metrics' });
    assert.equal(metricsUnauthorized.statusCode, 401);

    const cspReport = await app.inject({
      method: 'POST',
      url: '/api/security/csp-report',
      headers: { 'content-type': 'application/csp-report' },
      payload: JSON.stringify({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'http://example.com/app.js',
          'document-uri': 'http://127.0.0.1:8080/platform-admin',
        },
      }),
    });
    assert.equal(cspReport.statusCode, 204);

    const metricsAuthorized = await app.inject({
      method: 'GET',
      url: '/api/metrics',
      headers: { 'x-metrics-key': 'metrics-secret' },
    });
    assert.equal(metricsAuthorized.statusCode, 200);
    assert.match(metricsAuthorized.body, /driver_app_csp_violation_reports_total\{effective_directive="script-src-elem"\} 1/);
  } finally {
    await app.close();
  }
}
