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
    await waitForSessionText(page, 'Logged in as');
    await waitForOptions(page, '#settingsRestaurantSelect');
    await waitForOptions(page, '#driverSelect');
    await waitForOptions(page, '#dispatchRestaurantIds');
    await waitForOptions(page, '#dispatchMerchantIds');
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/logout') && response.request().method() === 'POST' && response.ok()),
      page.click('#logoutBtn'),
    ]);
    await waitForSessionText(page, 'Not logged in');

    await loginAndLogout('/merchant', 'falafel.group@demo.com', 'Password123', 'driverapp_merchant_session', 'Logged in as');
    await loginAndLogout('/restaurant', 'falafel.dispatch@demo.com', 'Password123', 'driverapp_restaurant_session', 'Logged in as');
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
