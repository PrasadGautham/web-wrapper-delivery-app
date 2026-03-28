const apiBase = '';
let hasSession = false;
let refreshingSession = null;
let merchants = [];
let restaurants = [];

async function request(path, options = {}, attemptRefresh = true) {
  const headers = {
    'X-Portal-Client': 'web',
    ...(options.headers || {}),
  };
  if (options.body != null && !Object.prototype.hasOwnProperty.call(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (response.status === 401 && hasSession && attemptRefresh && !path.includes('/api/auth/admin/refresh')) {
    await refreshSession();
    return request(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(body.message || 'Request failed');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function refreshSession() {
  if (!hasSession) throw new Error('No active session');
  if (!refreshingSession) {
    refreshingSession = request('/api/auth/admin/refresh', { method: 'POST' }, false)
      .then(() => {
        hasSession = true;
      })
      .finally(() => { refreshingSession = null; });
  }
  return refreshingSession;
}

function renderCollection(nodeId, items, renderItem) {
  const node = document.getElementById(nodeId);
  node.innerHTML = items.map(renderItem).join('') || '<div class="muted">No records.</div>';
}

function populateSelects() {
  document.getElementById('merchantSelect').innerHTML = merchants.map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
  document.getElementById('restaurantSelect').innerHTML = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
}

async function refreshDashboard() {
  try {
    const [session, merchantRows, restaurantRows, driverRows, adminRows] = await Promise.all([
      request('/api/auth/admin/session', {}, false),
      request('/api/admin/merchants', {}, false),
      request('/api/admin/restaurants', {}, false),
      request('/api/admin/drivers', {}, false),
      request('/api/admin/admin-users', {}, false),
    ]);
    hasSession = true;
    merchants = merchantRows;
    restaurants = restaurantRows;
    populateSelects();
    document.getElementById('sessionStatus').textContent = `Logged in as ${session.name} (${session.role})`;
    renderCollection('merchants', merchantRows, (merchant) => `
      <article class="card">
        <div><strong>${merchant.name}</strong></div>
        <div class="muted">${merchant.users.length} merchant users</div>
        <div class="muted">${merchant.users.map((user) => `${user.name} (${user.role})`).join(', ') || 'No merchant users'}</div>
      </article>
    `);
    renderCollection('restaurants', restaurantRows, (restaurant) => `
      <article class="card">
        <div><strong>${restaurant.name}</strong></div>
        <div class="muted">Merchant: ${restaurant.merchantId}</div>
        <div class="muted">Charge ${Number(restaurant.restaurantChargePerOrder).toFixed(2)} | Driver ${Number(restaurant.driverRatePerOrder).toFixed(2)}</div>
      </article>
    `);
    renderCollection('drivers', driverRows, (driver) => `
      <article class="card">
        <div><strong>${driver.name}</strong></div>
        <div class="muted">${driver.email}</div>
        <div class="muted">${driver.isOnline ? 'Online' : 'Offline'} | capacity ${driver.maxActiveOrders}</div>
      </article>
    `);
    renderCollection('admins', adminRows, (admin) => `
      <article class="card">
        <div><strong>${admin.name}</strong></div>
        <div class="muted">${admin.email}</div>
        <div class="muted">${admin.role} | ${admin.isActive ? 'Active' : 'Inactive'}</div>
      </article>
    `);
  } catch (error) {
    hasSession = false;
    document.getElementById('sessionStatus').textContent = 'Not logged in';
    throw error;
  }
}

async function login() {
  await request('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value.trim(),
    }),
  }, false);
  hasSession = true;
  await refreshDashboard();
}

async function logout() {
  try {
    if (hasSession) {
      await request('/api/auth/admin/logout', { method: 'POST' }, false);
    }
  } finally {
    hasSession = false;
    document.getElementById('sessionStatus').textContent = 'Not logged in';
  }
}

async function createMerchantUser() {
  const merchantId = document.getElementById('merchantSelect').value;
  await request(`/api/admin/merchants/${merchantId}/users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('merchantUserName').value.trim(),
      email: document.getElementById('merchantUserEmail').value.trim(),
      password: document.getElementById('merchantUserPassword').value,
      role: document.getElementById('merchantUserRole').value,
    }),
  });
  document.getElementById('merchantUserStatus').textContent = 'Merchant user created.';
  await refreshDashboard();
}

async function createStaffUser() {
  const restaurantId = document.getElementById('restaurantSelect').value;
  await request(`/api/admin/restaurants/${restaurantId}/staff-users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('staffName').value.trim(),
      email: document.getElementById('staffEmail').value.trim(),
      password: document.getElementById('staffPassword').value,
      role: document.getElementById('staffRole').value,
    }),
  });
  document.getElementById('staffStatus').textContent = 'Store staff account created.';
  await refreshDashboard();
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => alert(error.message)));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => alert(error.message)));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) alert(error.message); }));
document.getElementById('createMerchantUserBtn').addEventListener('click', () => createMerchantUser().catch((error) => { document.getElementById('merchantUserStatus').textContent = error.message; }));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { document.getElementById('staffStatus').textContent = error.message; }));

refreshDashboard().catch(() => {});
setInterval(() => { if (hasSession) refreshSession().catch(() => {}); }, 10 * 60 * 1000);
