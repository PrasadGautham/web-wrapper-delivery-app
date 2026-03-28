import { buildApp } from './src/app.js';
import { loadAppConfig } from './src/config/app-config.js';

const config = loadAppConfig({ ...process.env, WEB_SESSION_COOKIE_SECURE: 'false', ALLOW_ADMIN_API_KEY_FALLBACK: 'false', ALLOWED_WEB_ORIGINS: '' });
const { app } = await buildApp(config);

try {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/restaurant/login',
    headers: { 'x-portal-client': 'web' },
    payload: { email: 'falafel.dispatch@demo.com', password: 'Password123' },
  });
  console.log('LOGIN', login.statusCode, login.body);
  const setCookie = login.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.map((entry) => entry.split(';')[0]).join('; ') : String(setCookie).split(';')[0];

  const create = await app.inject({
    method: 'POST',
    url: '/api/restaurants/me/orders',
    headers: { cookie: cookieHeader, 'x-portal-client': 'web' },
    payload: {
      customerName: 'Test Customer',
      customerAddress: 'Dubai Marina, Dubai',
      customerLatitude: 25.0845,
      customerLongitude: 55.1417,
      deliveryArea: 'Dubai Marina',
    },
  });
  console.log('CREATE', create.statusCode, create.body);
} finally {
  await app.close();
}
