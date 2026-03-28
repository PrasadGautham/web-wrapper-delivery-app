import { buildApp } from './src/app.js';
import { loadAppConfig } from './src/config/app-config.js';

const config = loadAppConfig();
const { app } = await buildApp(config);

async function run() {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/merchant/login',
    payload: { email: 'falafel.group@demo.com', password: 'Password123' },
  });
  console.log('login', login.statusCode, login.body);
  const token = JSON.parse(login.body).token;

  for (const step of [
    { method: 'POST', url: '/api/auth/merchant/refresh' },
    { method: 'POST', url: '/api/auth/merchant/stream-ticket' },
  ]) {
    const response = await app.inject({
      method: step.method,
      url: step.url,
      headers: { authorization: `Bearer ${token}` },
    });
    console.log(step.url, response.statusCode, response.body);
  }

  await app.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
