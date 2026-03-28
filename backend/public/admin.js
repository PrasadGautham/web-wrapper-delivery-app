const apiBase = '';
let hasSession = false;
let refreshingSession = null;
let merchants = [];
let restaurants = [];
let drivers = [];

const nodes = {
  merchantSelect: document.getElementById('merchantSelect'),
  restaurantSelect: document.getElementById('restaurantSelect'),
  settingsRestaurantSelect: document.getElementById('settingsRestaurantSelect'),
  driverSelect: document.getElementById('driverSelect'),
  sessionStatus: document.getElementById('sessionStatus'),
  merchantUserStatus: document.getElementById('merchantUserStatus'),
  staffStatus: document.getElementById('staffStatus'),
  restaurantPricingStatus: document.getElementById('restaurantPricingStatus'),
  restaurantTrackingStatus: document.getElementById('restaurantTrackingStatus'),
  driverControlsStatus: document.getElementById('driverControlsStatus'),
};

function parseCommaSeparatedIds(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function formatMoney(value, currency = 'AED') {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function summarizePricingRule(rule, currency) {
  if (Number(rule.additionalPerKm || 0) <= 0) {
    return `${formatMoney(rule.baseAmount, currency)} flat per delivery`;
  }
  return `${formatMoney(rule.baseAmount, currency)} includes ${Number(rule.includedDistanceKm || 0).toFixed(1)} km, then ${formatMoney(rule.additionalPerKm, currency)} per extra km`;
}

function setRuleInputs(prefix, rule) {
  document.getElementById(`${prefix}BaseAmount`).value = String(rule.baseAmount ?? 0);
  document.getElementById(`${prefix}IncludedDistanceKm`).value = String(rule.includedDistanceKm ?? 0);
  document.getElementById(`${prefix}AdditionalPerKm`).value = String(rule.additionalPerKm ?? 0);
}

function readRuleInputs(prefix) {
  return {
    baseAmount: Number(document.getElementById(`${prefix}BaseAmount`).value),
    includedDistanceKm: Number(document.getElementById(`${prefix}IncludedDistanceKm`).value),
    additionalPerKm: Number(document.getElementById(`${prefix}AdditionalPerKm`).value),
  };
}

function updatePricingSummaries() {
  const restaurant = restaurants.find((item) => item.id === nodes.settingsRestaurantSelect.value) || restaurants[0];
  const currency = restaurant?.currency || 'AED';
  document.getElementById('driverPayoutSummary').textContent = summarizePricingRule(readRuleInputs('driverPayout'), currency);
  document.getElementById('merchantBillingSummary').textContent = summarizePricingRule(readRuleInputs('merchantBilling'), currency);
}

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
  const merchantOptions = merchants.map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
  const restaurantOptions = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  const driverOptions = drivers.map((driver) => `<option value="${driver.id}">${driver.name}</option>`).join('');
  nodes.merchantSelect.innerHTML = merchantOptions;
  nodes.restaurantSelect.innerHTML = restaurantOptions;
  nodes.settingsRestaurantSelect.innerHTML = restaurantOptions;
  nodes.driverSelect.innerHTML = driverOptions;
  syncRestaurantSettingsForm();
  syncDriverControlsForm();
}

function syncRestaurantSettingsForm() {
  const restaurant = restaurants.find((item) => item.id === nodes.settingsRestaurantSelect.value) || restaurants[0];
  if (!restaurant) {
    return;
  }
  nodes.settingsRestaurantSelect.value = restaurant.id;
  setRuleInputs('driverPayout', restaurant.pricing.driverPayoutRule);
  setRuleInputs('merchantBilling', restaurant.pricing.merchantBillingRule);
  document.getElementById('showPickedUpAsInTransit').checked = Boolean(restaurant.trackingSettings.showPickedUpAsInTransit);
  document.getElementById('showDriverEtaToPickup').checked = Boolean(restaurant.trackingSettings.showDriverEtaToPickup);
  document.getElementById('showDestinationEta').checked = Boolean(restaurant.trackingSettings.showDestinationEta);
  updatePricingSummaries();
}

function syncDriverControlsForm() {
  const driver = drivers.find((item) => item.id === nodes.driverSelect.value) || drivers[0];
  if (!driver) {
    return;
  }
  nodes.driverSelect.value = driver.id;
  document.getElementById('driverCapacity').value = String(driver.maxActiveOrders);
  document.getElementById('dispatchModeSelect').value = driver.dispatchPolicy.mode;
  document.getElementById('dispatchRestaurantIds').value = driver.dispatchPolicy.restaurantIds.join(', ');
  document.getElementById('dispatchMerchantIds').value = driver.dispatchPolicy.merchantIds.join(', ');
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
    drivers = driverRows;
    populateSelects();
    nodes.sessionStatus.textContent = `Logged in as ${session.name} (${session.role})`;
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
        <div class="muted">Driver payout: ${summarizePricingRule(restaurant.pricing.driverPayoutRule, restaurant.currency)}</div>
        <div class="muted">Merchant billing: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency)}</div>
        <div class="muted">Pickup ETA visible: ${restaurant.trackingSettings.showDriverEtaToPickup ? 'Yes' : 'No'} | Destination ETA visible: ${restaurant.trackingSettings.showDestinationEta ? 'Yes' : 'No'}</div>
      </article>
    `);
    renderCollection('drivers', driverRows, (driver) => `
      <article class="card">
        <div><strong>${driver.name}</strong></div>
        <div class="muted">${driver.email}</div>
        <div class="muted">${driver.isOnline ? 'Online' : 'Offline'} | capacity ${driver.maxActiveOrders} | load ${driver.currentLoad}</div>
        <div class="muted">Dispatch: ${driver.dispatchPolicy.mode}</div>
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
    nodes.sessionStatus.textContent = 'Not logged in';
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
    nodes.sessionStatus.textContent = 'Not logged in';
  }
}

async function createMerchantUser() {
  const merchantId = nodes.merchantSelect.value;
  await request(`/api/admin/merchants/${merchantId}/users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('merchantUserName').value.trim(),
      email: document.getElementById('merchantUserEmail').value.trim(),
      password: document.getElementById('merchantUserPassword').value,
      role: document.getElementById('merchantUserRole').value,
    }),
  });
  nodes.merchantUserStatus.textContent = 'Merchant user created.';
  await refreshDashboard();
}

async function createStaffUser() {
  const restaurantId = nodes.restaurantSelect.value;
  await request(`/api/admin/restaurants/${restaurantId}/staff-users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('staffName').value.trim(),
      email: document.getElementById('staffEmail').value.trim(),
      password: document.getElementById('staffPassword').value,
      role: document.getElementById('staffRole').value,
    }),
  });
  nodes.staffStatus.textContent = 'Store staff account created.';
  await refreshDashboard();
}

async function saveRestaurantPricing() {
  const restaurantId = nodes.settingsRestaurantSelect.value;
  await request(`/api/admin/restaurants/${restaurantId}/pricing`, {
    method: 'PATCH',
    body: JSON.stringify({
      driverPayoutRule: readRuleInputs('driverPayout'),
      merchantBillingRule: readRuleInputs('merchantBilling'),
    }),
  });
  nodes.restaurantPricingStatus.textContent = 'Restaurant commercial terms updated.';
  await refreshDashboard();
}

async function saveTrackingSettings() {
  const restaurantId = nodes.settingsRestaurantSelect.value;
  await request(`/api/admin/restaurants/${restaurantId}/tracking-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      showPickedUpAsInTransit: document.getElementById('showPickedUpAsInTransit').checked,
      showDriverEtaToPickup: document.getElementById('showDriverEtaToPickup').checked,
      showDestinationEta: document.getElementById('showDestinationEta').checked,
    }),
  });
  nodes.restaurantTrackingStatus.textContent = 'Restaurant tracking display updated.';
  await refreshDashboard();
}

async function saveDriverCapacity() {
  const driverId = nodes.driverSelect.value;
  await request(`/api/admin/drivers/${driverId}/capacity`, {
    method: 'PATCH',
    body: JSON.stringify({
      maxActiveOrders: Number(document.getElementById('driverCapacity').value),
    }),
  });
  nodes.driverControlsStatus.textContent = 'Driver capacity updated.';
  await refreshDashboard();
}

async function saveDriverDispatch() {
  const driverId = nodes.driverSelect.value;
  await request(`/api/admin/drivers/${driverId}/dispatch-policy`, {
    method: 'PATCH',
    body: JSON.stringify({
      mode: document.getElementById('dispatchModeSelect').value,
      restaurantIds: parseCommaSeparatedIds(document.getElementById('dispatchRestaurantIds').value),
      merchantIds: parseCommaSeparatedIds(document.getElementById('dispatchMerchantIds').value),
    }),
  });
  nodes.driverControlsStatus.textContent = 'Driver dispatch policy updated.';
  await refreshDashboard();
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => alert(error.message)));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => alert(error.message)));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) alert(error.message); }));
document.getElementById('createMerchantUserBtn').addEventListener('click', () => createMerchantUser().catch((error) => { nodes.merchantUserStatus.textContent = error.message; }));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { nodes.staffStatus.textContent = error.message; }));
document.getElementById('saveRestaurantPricingBtn').addEventListener('click', () => saveRestaurantPricing().catch((error) => { nodes.restaurantPricingStatus.textContent = error.message; }));
document.getElementById('saveTrackingBtn').addEventListener('click', () => saveTrackingSettings().catch((error) => { nodes.restaurantTrackingStatus.textContent = error.message; }));
document.getElementById('saveCapacityBtn').addEventListener('click', () => saveDriverCapacity().catch((error) => { nodes.driverControlsStatus.textContent = error.message; }));
document.getElementById('saveDispatchBtn').addEventListener('click', () => saveDriverDispatch().catch((error) => { nodes.driverControlsStatus.textContent = error.message; }));
nodes.settingsRestaurantSelect.addEventListener('change', syncRestaurantSettingsForm);
nodes.driverSelect.addEventListener('change', syncDriverControlsForm);
['driverPayoutBaseAmount','driverPayoutIncludedDistanceKm','driverPayoutAdditionalPerKm','merchantBillingBaseAmount','merchantBillingIncludedDistanceKm','merchantBillingAdditionalPerKm'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updatePricingSummaries);
});

refreshDashboard().catch(() => {});
setInterval(() => { if (hasSession) refreshSession().catch(() => {}); }, 10 * 60 * 1000);
