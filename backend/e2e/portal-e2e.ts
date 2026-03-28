import { chromium, Page } from '@playwright/test';

import { buildApp } from '../src/app.js';
import { loadAppConfig } from '../src/config/app-config.js';

async function waitForSessionText(page: Page, expectedSnippet: string) {
  await page.waitForFunction(
    ([selector, snippet]) => document.querySelector(selector)?.textContent?.includes(snippet) ?? false,
    ['#sessionStatus', expectedSnippet],
  );
}

async function waitForOptions(page: Page, selector: string, minimumCount = 1) {
  await page.waitForFunction(
    ([query, count]) => (document.querySelector(query) as HTMLSelectElement | null)?.options.length >= count,
    [selector, minimumCount],
  );
}

async function waitForText(page: Page, selector: string, expectedSnippet: string) {
  await page.waitForFunction(
    ([query, snippet]) => document.querySelector(query)?.textContent?.includes(snippet) ?? false,
    [selector, expectedSnippet],
  );
}

async function run() {
  process.env.WEB_SESSION_COOKIE_SECURE = 'false';
  process.env.WEB_SESSION_COOKIE_SAME_SITE = 'Strict';
  process.env.ALLOW_ADMIN_API_KEY_FALLBACK = 'false';
  process.env.ALLOWED_WEB_ORIGINS = '';

  const config = loadAppConfig(process.env);
  const { app } = await buildApp(config);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  async function loginAndLogout(path: string, email: string, password: string, cookieName: string, loggedInSnippet: string) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#password', password);

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/login') && response.request().method() === 'POST' && response.ok()),
      page.click('#loginBtn'),
    ]);
    await waitForSessionText(page, loggedInSnippet);

    const cookieNames = (await context.cookies(baseUrl)).map((cookie) => cookie.name);
    if (!cookieNames.includes(cookieName)) {
      throw new Error(`${cookieName} was not set.`);
    }

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/logout') && response.request().method() === 'POST' && response.ok()),
      page.click('#logoutBtn'),
    ]);
    await waitForSessionText(page, 'Not logged in');
  }

  try {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await page.fill('#email', 'admin@demo.com');
    await page.fill('#password', 'Password123');
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/login') && response.request().method() === 'POST' && response.ok()),
      page.click('#loginBtn'),
    ]);
    await waitForOptions(page, '#tenantContextSelect');
    await waitForOptions(page, '#settingsRestaurantSelect');
    await waitForOptions(page, '#driverSelect');
    await waitForOptions(page, '#dispatchRestaurantIds');
    await waitForOptions(page, '#dispatchMerchantIds');

    await loginAndLogout('/merchant', 'falafel.group@demo.com', 'Password123', 'driverapp_merchant_session', 'Logged in as');
    await loginAndLogout('/restaurant', 'falafel.dispatch@demo.com', 'Password123', 'driverapp_restaurant_session', 'Logged in as');

    const merchantPage = await context.newPage();
    const restaurantPage = await context.newPage();

    await merchantPage.goto(`${baseUrl}/merchant`, { waitUntil: 'networkidle' });
    await merchantPage.fill('#email', 'falafel.group@demo.com');
    await merchantPage.fill('#password', 'Password123');
    await Promise.all([
      merchantPage.waitForResponse((response) => response.url().endsWith('/login') && response.request().method() === 'POST' && response.ok()),
      merchantPage.click('#loginBtn'),
    ]);
    await waitForSessionText(merchantPage, 'Logged in as');

    await restaurantPage.goto(`${baseUrl}/restaurant`, { waitUntil: 'networkidle' });
    await restaurantPage.fill('#email', 'falafel.dispatch@demo.com');
    await restaurantPage.fill('#password', 'Password123');
    await Promise.all([
      restaurantPage.waitForResponse((response) => response.url().endsWith('/login') && response.request().method() === 'POST' && response.ok()),
      restaurantPage.click('#loginBtn'),
    ]);
    await waitForSessionText(restaurantPage, 'Logged in as');

    await restaurantPage.fill('#customerName', 'Portal E2E Customer');
    await restaurantPage.fill('#customerAddress', 'Dubai Marina Walk');
    await restaurantPage.fill('#deliveryArea', 'Dubai Marina');
    await Promise.all([
      restaurantPage.waitForResponse((response) => response.url().endsWith('/api/restaurants/me/orders') && response.request().method() === 'POST' && response.ok()),
      restaurantPage.click('#createOrderBtn'),
    ]);
    await waitForText(restaurantPage, '#orders', 'Portal E2E Customer');
    await waitForText(merchantPage, '#orders', 'Portal E2E Customer');

    await merchantPage.close();
    await restaurantPage.close();
    console.log('PASS portal-e2e');
  } finally {
    await context.close();
    await browser.close();
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
