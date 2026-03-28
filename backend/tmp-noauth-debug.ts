import { buildApp } from './src/app.js';
import { loadAppConfig } from './src/config/app-config.js';

const config = loadAppConfig();
const { app } = await buildApp(config);

for (const step of [
  { method: 'POST', url: '/api/auth/merchant/stream-ticket' },
  { method: 'POST', url: '/api/auth/admin/logout' },
  { method: 'POST', url: '/api/auth/restaurant/stream-ticket' },
  { method: 'POST', url: '/api/auth/restaurant/logout' },
]) {
  const response = await app.inject({ method: step.method, url: step.url });
  console.log(step.url, response.statusCode, JSON.stringify(response.body));
}

await app.close();
