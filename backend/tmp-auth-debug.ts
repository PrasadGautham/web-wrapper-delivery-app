import { buildApp } from './src/app.js';
import { loadAppConfig } from './src/config/app-config.js';

const config = loadAppConfig();
const { app } = await buildApp(config);

const merchantLogin = await app.inject({ method: 'POST', url: '/api/auth/merchant/login', payload: { email: 'falafel.group@demo.com', password: 'Password123' } });
const merchantToken = JSON.parse(merchantLogin.body).token;
console.log('merchant login', merchantLogin.statusCode, merchantLogin.body);
for (const url of ['/api/auth/merchant/stream-ticket', '/api/auth/merchant/logout']) {
  const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${merchantToken}` } });
  console.log(url, response.statusCode, response.body);
}

const restaurantLogin = await app.inject({ method: 'POST', url: '/api/auth/restaurant/login', payload: { email: 'falafel.dispatch@demo.com', password: 'Password123' } });
const restaurantToken = JSON.parse(restaurantLogin.body).token;
console.log('restaurant login', restaurantLogin.statusCode, restaurantLogin.body);
for (const url of ['/api/auth/restaurant/stream-ticket', '/api/auth/restaurant/logout']) {
  const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${restaurantToken}` } });
  console.log(url, response.statusCode, response.body);
}

await app.close();
