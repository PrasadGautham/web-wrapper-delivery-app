const apiBase = '';
let hasSession = false;
let refreshingSession = null;
let merchants = [];
let restaurants = [];
let drivers = [];
let adminUsers = [];

const MILES_PER_KILOMETER = 0.621371;
const KILOMETERS_PER_MILE = 1.609344;

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
  displaySettingsStatus: document.getElementById('displaySettingsStatus'),
  driverControlsStatus: document.getElementById('driverControlsStatus'),
  statMerchants: document.getElementById('statMerchants'),
  statRestaurants: document.getElementById('statRestaurants'),
  statOnlineDrivers: document.getElementById('statOnlineDrivers'),
  statAdmins: document.getElementById('statAdmins'),
  selectedRestaurantSummary: document.getElementById('selectedRestaurantSummary'),
  selectedDriverSummary: document.getElementById('selectedDriverSummary'),
  trackingStoreHint: document.getElementById('trackingStoreHint'),
  dispatchRestaurantIds: document.getElementById('dispatchRestaurantIds'),
  dispatchMerchantIds: document.getElementById('dispatchMerchantIds'),
};

function currentRestaurant() {
  return restaurants.find((item) => item.id === nodes.settingsRestaurantSelect.value) || restaurants[0] || null;
}

function getSelectedValues(selectNode) {
  return Array.from(selectNode.selectedOptions).map((option) => option.value).filter(Boolean);
}

function setSelectedValues(selectNode, values) {
  const selected = new Set(values);
  for (const option of selectNode.options) {
    option.selected = selected.has(option.value);
  }
}

function normalizeCurrencyCode(value) {
  return String(value || '').trim().toUpperCase();
}

function formatMoney(value, currency = 'AED') {
  const code = normalizeCurrencyCode(currency) || 'AED';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, minimumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

function toDisplayDistance(kmValue, unit = 'kilometer') {
  return unit === 'mile' ? Number(kmValue || 0) * MILES_PER_KILOMETER : Number(kmValue || 0);
}

function fromDisplayDistance(displayValue, unit = 'kilometer') {
  return unit === 'mile' ? Number(displayValue || 0) * KILOMETERS_PER_MILE : Number(displayValue || 0);
}

function toDisplayRate(perKmValue, unit = 'kilometer') {
  return unit === 'mile' ? Number(perKmValue || 0) * KILOMETERS_PER_MILE : Number(perKmValue || 0);
}

function fromDisplayRate(displayRate, unit = 'kilometer') {
  return unit === 'mile' ? Number(displayRate || 0) / KILOMETERS_PER_MILE : Number(displayRate || 0);
}

function distanceUnitShort(unit = 'kilometer') {
  return unit === 'mile' ? 'mi' : 'km';
}

function distanceUnitWord(unit = 'kilometer') {
  return unit === 'mile' ? 'mile' : 'km';
}

function summarizePricingRule(rule, currency, unit = 'kilometer') {
  const included = toDisplayDistance(rule.includedDistanceKm || 0, unit);
  const extraRate = toDisplayRate(rule.additionalPerKm || 0, unit);
  if (Number(extraRate) <= 0) {
    return `${formatMoney(rule.baseAmount, currency)} flat per delivery`;
  }
  return `${formatMoney(rule.baseAmount, currency)} includes ${included.toFixed(1)} ${distanceUnitShort(unit)}, then ${formatMoney(extraRate, currency)} per extra ${distanceUnitWord(unit)}`;
}

function updatePricingFieldLabels(unit = 'kilometer') {
  const short = distanceUnitShort(unit);
  document.getElementById('driverPayoutIncludedDistanceLabel').textContent = `Included distance (${short})`;
  document.getElementById('driverPayoutAdditionalPerUnitLabel').textContent = `Additional amount per extra ${distanceUnitWord(unit)}`;
  document.getElementById('merchantBillingIncludedDistanceLabel').textContent = `Included distance (${short})`;
  document.getElementById('merchantBillingAdditionalPerUnitLabel').textContent = `Additional amount per extra ${distanceUnitWord(unit)}`;
}

function setRuleInputs(prefix, rule, unit) {
  document.getElementById(`${prefix}BaseAmount`).value = String(rule.baseAmount ?? 0);
  document.getElementById(`${prefix}IncludedDistanceKm`).value = toDisplayDistance(rule.includedDistanceKm ?? 0, unit).toFixed(1);
  document.getElementById(`${prefix}AdditionalPerKm`).value = toDisplayRate(rule.additionalPerKm ?? 0, unit).toFixed(2);
}

function readRuleInputs(prefix, unit) {
  return {
    baseAmount: Number(document.getElementById(`${prefix}BaseAmount`).value),
    includedDistanceKm: Number(fromDisplayDistance(document.getElementById(`${prefix}IncludedDistanceKm`).value, unit).toFixed(3)),
    additionalPerKm: Number(fromDisplayRate(document.getElementById(`${prefix}AdditionalPerKm`).value, unit).toFixed(4)),
  };
}

function updatePricingSummaries() {
  const restaurant = currentRestaurant();
  const currency = normalizeCurrencyCode(restaurant?.currency || document.getElementById('currencyCode').value || 'AED');
  const unit = restaurant?.distanceUnit || document.getElementById('distanceUnit').value || 'kilometer';
  updatePricingFieldLabels(unit);
  document.getElementById('driverPayoutSummary').textContent = summarizePricingRule(readRuleInputs('driverPayout', unit), currency, unit);
  document.getElementById('merchantBillingSummary').textContent = summarizePricingRule(readRuleInputs('merchantBilling', unit), currency, unit);
}

async function request(path, options = {}, attemptRefresh = true) {
  const headers = { 'X-Portal-Client': 'web', ...(options.headers || {}) };
  if (options.body != null && !Object.prototype.hasOwnProperty.call(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${apiBase}${path}`, { ...options, headers, credentials: 'same-origin' });
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
      .then(() => { hasSession = true; })
      .finally(() => { refreshingSession = null; });
  }
  return refreshingSession;
}

function renderCollection(nodeId, items, renderItem) {
  const node = document.getElementById(nodeId);
  node.innerHTML = items.map(renderItem).join('') || '<div class="muted">No records.</div>';
}

function populateDispatchSelectors() {
  nodes.dispatchRestaurantIds.innerHTML = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  nodes.dispatchMerchantIds.innerHTML = merchants.map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
}

function populateSelects() {
  const merchantOptions = merchants.map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
  const restaurantOptions = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  const driverOptions = drivers.map((driver) => `<option value="${driver.id}">${driver.name}</option>`).join('');
  nodes.merchantSelect.innerHTML = merchantOptions;
  nodes.restaurantSelect.innerHTML = restaurantOptions;
  nodes.settingsRestaurantSelect.innerHTML = restaurantOptions;
  nodes.driverSelect.innerHTML = driverOptions;
  populateDispatchSelectors();
  syncRestaurantSettingsForm();
  syncDriverControlsForm();
}

function syncRestaurantSettingsForm() {
  const restaurant = currentRestaurant();
  if (!restaurant) {
    nodes.selectedRestaurantSummary.textContent = 'Select a store to view its current commercial and tracking setup.';
    if (nodes.trackingStoreHint) {
      nodes.trackingStoreHint.textContent = 'Choose a store above. The tracking view settings saved here apply only to that one store.';
    }
    return;
  }
  nodes.settingsRestaurantSelect.value = restaurant.id;
  document.getElementById('currencyCode').value = normalizeCurrencyCode(restaurant.currency);
  document.getElementById('distanceUnit').value = restaurant.distanceUnit || 'kilometer';
  updatePricingFieldLabels(restaurant.distanceUnit || 'kilometer');
  setRuleInputs('driverPayout', restaurant.pricing.driverPayoutRule, restaurant.distanceUnit || 'kilometer');
  setRuleInputs('merchantBilling', restaurant.pricing.merchantBillingRule, restaurant.distanceUnit || 'kilometer');
  document.getElementById('showPickedUpAsInTransit').checked = Boolean(restaurant.trackingSettings.showPickedUpAsInTransit);
  document.getElementById('showDriverEtaToPickup').checked = Boolean(restaurant.trackingSettings.showDriverEtaToPickup);
  document.getElementById('showDestinationEta').checked = Boolean(restaurant.trackingSettings.showDestinationEta);
  document.getElementById('driverOfferDistanceMode').value = restaurant.driverOfferSettings?.distanceMode || 'storeToCustomer';
  if (nodes.trackingStoreHint) {
    nodes.trackingStoreHint.textContent = `Tracking display settings below apply only to ${restaurant.name}.`;
  }
  const merchantName = merchants.find((merchant) => merchant.id === restaurant.merchantId)?.name || restaurant.merchantId;
  nodes.selectedRestaurantSummary.innerHTML = `
    <strong>${restaurant.name}</strong>
    <div>Restaurant group: ${merchantName}</div>
    <div>Commercial currency: ${normalizeCurrencyCode(restaurant.currency)}</div>
    <div>Distance unit: ${restaurant.distanceUnit === 'mile' ? 'Miles (mi)' : 'Kilometers (km)'}</div>
    <div>Driver pay: ${summarizePricingRule(restaurant.pricing.driverPayoutRule, restaurant.currency, restaurant.distanceUnit)}</div>
    <div>Store charge: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div>
    <div>Tracking view: pickup ETA ${restaurant.trackingSettings.showDriverEtaToPickup ? 'visible' : 'hidden'}, destination ETA ${restaurant.trackingSettings.showDestinationEta ? 'visible' : 'hidden'}</div>
    <div>Driver app offer view: ${restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute to store plus delivery' : 'Store to customer only'}</div>
  `;
  updatePricingSummaries();
}

function syncDriverControlsForm() {
  const driver = drivers.find((item) => item.id === nodes.driverSelect.value) || drivers[0];
  if (!driver) {
    nodes.selectedDriverSummary.textContent = 'Select a driver to review capacity and assignment scope.';
    return;
  }
  nodes.driverSelect.value = driver.id;
  document.getElementById('driverCapacity').value = String(driver.maxActiveOrders);
  document.getElementById('dispatchModeSelect').value = driver.dispatchPolicy.mode;
  setSelectedValues(nodes.dispatchRestaurantIds, driver.dispatchPolicy.restaurantIds);
  setSelectedValues(nodes.dispatchMerchantIds, driver.dispatchPolicy.merchantIds);
  const assignedRestaurantNames = restaurants.filter((restaurant) => driver.dispatchPolicy.restaurantIds.includes(restaurant.id)).map((restaurant) => restaurant.name);
  const assignedMerchantNames = merchants.filter((merchant) => driver.dispatchPolicy.merchantIds.includes(merchant.id)).map((merchant) => merchant.name);
  nodes.selectedDriverSummary.innerHTML = `
    <strong>${driver.name}</strong>
    <div>${driver.isOnline ? 'Online' : 'Offline'} | Load ${driver.currentLoad}/${driver.maxActiveOrders}</div>
    <div>Dispatch mode: ${driver.dispatchPolicy.mode}</div>
    <div>Allowed stores: ${assignedRestaurantNames.join(', ') || 'None selected'}</div>
    <div>Allowed restaurant groups: ${assignedMerchantNames.join(', ') || 'None selected'}</div>
    <div>Location freshness: ${driver.locationFreshness}</div>
  `;
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
    adminUsers = adminRows;
    populateSelects();
    nodes.sessionStatus.textContent = `Logged in as ${session.name} (${session.role})`;
    nodes.statMerchants.textContent = String(merchantRows.length);
    nodes.statRestaurants.textContent = String(restaurantRows.length);
    nodes.statOnlineDrivers.textContent = String(driverRows.filter((driver) => driver.isOnline).length);
    nodes.statAdmins.textContent = String(adminRows.length);
    renderCollection('merchants', merchantRows, (merchant) => `
      <article class="card">
        <div><strong>${merchant.name}</strong></div>
        <div class="muted">${merchant.users.length} merchant users</div>
        <div class="muted">${merchant.users.map((user) => `${user.name} (${user.role})`).join(', ') || 'No merchant users'}</div>
      </article>
    `);
    renderCollection('restaurants', restaurantRows, (restaurant) => {
      const merchantName = merchantRows.find((merchant) => merchant.id === restaurant.merchantId)?.name || restaurant.merchantId;
      return `
        <article class="card">
          <div class="eyebrow">${merchantName}</div>
          <h4>${restaurant.name}</h4>
          <div class="muted">Currency: ${normalizeCurrencyCode(restaurant.currency)} | Distance unit: ${restaurant.distanceUnit === 'mile' ? 'Miles' : 'Kilometers'}</div>
          <div class="muted">Driver pay: ${summarizePricingRule(restaurant.pricing.driverPayoutRule, restaurant.currency, restaurant.distanceUnit)}</div>
          <div class="muted">Store charge: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div>
          <div class="muted">Pickup ETA ${restaurant.trackingSettings.showDriverEtaToPickup ? 'visible' : 'hidden'} | Destination ETA ${restaurant.trackingSettings.showDestinationEta ? 'visible' : 'hidden'}</div>
          <div class="muted">Driver app offer: ${restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute + delivery' : 'Store to customer only'}</div>
        </article>
      `;
    });
    renderCollection('drivers', driverRows, (driver) => {
      const assignedRestaurantNames = restaurantRows.filter((restaurant) => driver.dispatchPolicy.restaurantIds.includes(restaurant.id)).map((restaurant) => restaurant.name).join(', ') || 'None selected';
      const assignedMerchantNames = merchantRows.filter((merchant) => driver.dispatchPolicy.merchantIds.includes(merchant.id)).map((merchant) => merchant.name).join(', ') || 'None selected';
      return `
        <article class="card">
          <div><strong>${driver.name}</strong></div>
          <div class="muted">${driver.email}</div>
          <div class="muted">${driver.isOnline ? 'Online' : 'Offline'} | Capacity ${driver.maxActiveOrders} | Load ${driver.currentLoad}</div>
          <div class="muted">Dispatch mode: ${driver.dispatchPolicy.mode}</div>
          <div class="muted">Stores: ${assignedRestaurantNames}</div>
          <div class="muted">Restaurant groups: ${assignedMerchantNames}</div>
        </article>
      `;
    });
    renderCollection('admins', adminUsers, (admin) => `
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
    body: JSON.stringify({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value.trim() }),
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
  const restaurant = currentRestaurant();
  if (!restaurant) return;
  await request(`/api/admin/restaurants/${restaurant.id}/pricing`, {
    method: 'PATCH',
    body: JSON.stringify({
      driverPayoutRule: readRuleInputs('driverPayout', restaurant.distanceUnit || 'kilometer'),
      merchantBillingRule: readRuleInputs('merchantBilling', restaurant.distanceUnit || 'kilometer'),
    }),
  });
  nodes.restaurantPricingStatus.textContent = 'Restaurant commercial terms updated.';
  await refreshDashboard();
}

async function saveDisplaySettings() {
  const restaurant = currentRestaurant();
  if (!restaurant) return;
  await request(`/api/admin/restaurants/${restaurant.id}/display-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      currency: normalizeCurrencyCode(document.getElementById('currencyCode').value),
      distanceUnit: document.getElementById('distanceUnit').value,
    }),
  });
  nodes.displaySettingsStatus.textContent = 'Store market settings updated. Pricing fields now use the saved distance unit.';
  await refreshDashboard();
}

async function saveTrackingSettings() {
  const restaurant = currentRestaurant();
  if (!restaurant) return;
  await request(`/api/admin/restaurants/${restaurant.id}/tracking-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      showPickedUpAsInTransit: document.getElementById('showPickedUpAsInTransit').checked,
      showDriverEtaToPickup: document.getElementById('showDriverEtaToPickup').checked,
      showDestinationEta: document.getElementById('showDestinationEta').checked,
    }),
  });
  await request(`/api/admin/restaurants/${restaurant.id}/driver-offer-settings`, {
    method: 'PATCH',
    body: JSON.stringify({ distanceMode: document.getElementById('driverOfferDistanceMode').value }),
  });
  nodes.restaurantTrackingStatus.textContent = 'Restaurant tracking and driver app display updated.';
  await refreshDashboard();
}

async function saveDriverSettings() {
  const driverId = nodes.driverSelect.value;
  await request(`/api/admin/drivers/${driverId}/capacity`, {
    method: 'PATCH',
    body: JSON.stringify({ maxActiveOrders: Number(document.getElementById('driverCapacity').value) }),
  });
  await request(`/api/admin/drivers/${driverId}/dispatch-policy`, {
    method: 'PATCH',
    body: JSON.stringify({
      mode: document.getElementById('dispatchModeSelect').value,
      restaurantIds: getSelectedValues(nodes.dispatchRestaurantIds),
      merchantIds: getSelectedValues(nodes.dispatchMerchantIds),
    }),
  });
  nodes.driverControlsStatus.textContent = 'Driver settings updated.';
  await refreshDashboard();
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => alert(error.message)));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => alert(error.message)));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) alert(error.message); }));
document.getElementById('createMerchantUserBtn').addEventListener('click', () => createMerchantUser().catch((error) => { nodes.merchantUserStatus.textContent = error.message; }));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { nodes.staffStatus.textContent = error.message; }));
document.getElementById('saveRestaurantPricingBtn').addEventListener('click', () => saveRestaurantPricing().catch((error) => { nodes.restaurantPricingStatus.textContent = error.message; }));
document.getElementById('saveDisplaySettingsBtn').addEventListener('click', () => saveDisplaySettings().catch((error) => { nodes.displaySettingsStatus.textContent = error.message; }));
document.getElementById('saveTrackingBtn').addEventListener('click', () => saveTrackingSettings().catch((error) => { nodes.restaurantTrackingStatus.textContent = error.message; }));
document.getElementById('saveDriverSettingsBtn').addEventListener('click', () => saveDriverSettings().catch((error) => { nodes.driverControlsStatus.textContent = error.message; }));
nodes.settingsRestaurantSelect.addEventListener('change', syncRestaurantSettingsForm);
nodes.driverSelect.addEventListener('change', syncDriverControlsForm);
document.getElementById('currencyCode').addEventListener('input', updatePricingSummaries);
document.getElementById('distanceUnit').addEventListener('change', () => {
  nodes.displaySettingsStatus.textContent = 'Save store market settings to apply the new distance unit to pricing fields and the driver app.';
});
['driverPayoutBaseAmount','driverPayoutIncludedDistanceKm','driverPayoutAdditionalPerKm','merchantBillingBaseAmount','merchantBillingIncludedDistanceKm','merchantBillingAdditionalPerKm'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updatePricingSummaries);
});

refreshDashboard().catch(() => {});
setInterval(() => { if (hasSession) refreshSession().catch(() => {}); }, 10 * 60 * 1000);
