import { buildApp } from '../src/app.js';
import { loadAppConfig } from '../src/config/app-config.js';

async function main(): Promise<void> {
  const config = loadAppConfig();
  const { app } = await buildApp(config);

  try {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    if (health.statusCode !== 200) {
      throw new Error(`Health check failed with status ${health.statusCode}`);
    }

    const metrics = await app.inject({ method: 'GET', url: '/api/metrics' });
    if (metrics.statusCode !== 200) {
      throw new Error(`Metrics check failed with status ${metrics.statusCode}`);
    }
    if (!metrics.body.includes('driver_app_http_requests_total')) {
      throw new Error('Metrics payload missing driver_app_http_requests_total');
    }

    const payload = health.json() as {
      ok?: boolean;
      storage?: string;
      readModel?: string;
      trafficAwareEta?: boolean;
      rateLimiter?: string;
    };

    if (!payload.ok) {
      throw new Error('Health payload did not report ok=true');
    }

    console.log('Deployment smoke check passed.');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Deployment smoke check failed.');
  console.error(error);
  process.exit(1);
});
