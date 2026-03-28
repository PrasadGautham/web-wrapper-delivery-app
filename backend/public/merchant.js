const apiBase = '';
let hasSession = false;
let stream = null;
let refreshingSession = null;
let restaurants = [];

const MILES_PER_KILOMETER = 0.621371;
const KILOMETERS_PER_MILE = 1.609344;

const nodes = {
  connectionDot: document.getElementById('connectionDot'),
  connectionText: document.getElementById('connectionText'),
  sessionStatus: document.getElementById('sessionStatus'),
  restaurantSelect: document.getElementById('restaurantSelect'),
  trackingStatus: document.getElementById('trackingStatus'),
  staffStatus: document.getElementById('staffStatus'),
  staffList: document.getElementById('staffList'),
  restaurants: document.getElementById('restaurants'),
  orders: document.getElementById('orders'),
  statStores: document.getElementById('statStores'),
  statOrders: document.getElementById('statOrders'),
  billingSummary: document.getElementById('billingSummary'),
  statCharges: document.getElementById('statCharges'),
  selectedStoreSummary: document.getElementById('selectedStoreSummary'),
};

function currentRestaurant() {
  return restaurants.find((item) => item.id === nodes.restaurantSelect.value) || restaurants[0] || null;
}

function normalizeCurrencyCode(value) {
  return String(value || '').trim().toUpperCase();
}

function formatMoney(value, code = 'AED') {
  const normalized = normalizeCurrencyCode(code) || 'AED';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: normalized, minimumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${normalized} ${Number(value || 0).toFixed(2)}`;
  }
}

function toDisplayDistance(kmValue, unit = 'kilometer') {
  const numeric = Number(kmValue || 0);
  return unit === 'mile' ? numeric * MILES_PER_KILOMETER : numeric;
}

function toDisplayRate(perKmValue, unit = 'kilometer') {
  const numeric = Number(perKmValue || 0);
  return unit === 'mile' ? numeric * KILOMETERS_PER_MILE : numeric;
}

function distanceUnitShort(unit = 'kilometer') {
  return unit === 'mile' ? 'mi' : 'km';
}

function distanceUnitWord(unit = 'kilometer') {
  return unit === 'mile' ? 'mile' : 'km';
}

function formatDistance(kmValue, unit = 'kilometer') {
  return `${toDisplayDistance(kmValue, unit).toFixed(1)} ${distanceUnitShort(unit)}`;
}

function summarizePricingRule(rule, code, unit = 'kilometer') {
  const included = toDisplayDistance(rule.includedDistanceKm || 0, unit);
  const extraRate = toDisplayRate(rule.additionalPerKm || 0, unit);
  if (Number(extraRate) <= 0) {
    return `${formatMoney(rule.baseAmount, code)} flat per delivery`;
  }
  return `${formatMoney(rule.baseAmount, code)} includes ${included.toFixed(1)} ${distanceUnitShort(unit)}, then ${formatMoney(extraRate, code)} per extra ${distanceUnitWord(unit)}`;
}

function formatStatus(value) {
  if (!value) return 'Unknown';
  if (value === 'inTransit') return 'In transit';
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function formatMinutes(value) {
  if (value == null) return 'Not available';
  return `${value} min`;
}

function formatEtaSource(value) {
  if (!value || value === 'not-available') return 'Not available';
  if (value === 'static-estimate') return 'Static estimate';
  if (value === 'live-driver-location') return 'Live driver location';
  if (value === 'google-routes') return 'Google traffic routing';
  return value;
}

function summarizeCurrencyTotals(groups, field) {
  const totals = new Map();
  for (const group of groups) {
    const currencyCode = normalizeCurrencyCode(group.restaurant.currency || 'AED');
    const total = group.orders.reduce((sum, order) => sum + Number(order[field] || 0), 0);
    totals.set(currencyCode, (totals.get(currencyCode) || 0) + total);
  }
  if (!totals.size) return '0';
  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([currencyCode, amount]) => formatMoney(amount, currencyCode))
    .join(' / ') || formatMoney(0, 'AED');
}

function clearSessionState(message = 'Merchant session expired. Please log in again.') {
  hasSession = false;
  stopStream();
  restaurants = [];
  nodes.sessionStatus.textContent = message;
  nodes.billingSummary.textContent = 'Select a store to review its billing terms.';
  nodes.trackingStatus.textContent = 'Update how restaurant staff see delivery progress for this store.';
  nodes.staffStatus.textContent = 'Create and review staff users for the selected store.';
  nodes.selectedStoreSummary.textContent = 'Select a store to review its current settings and staff setup.';
  refreshDashboard().catch((error) => console.error(error));
}

function setConnectionState(text, live) {
  nodes.connectionText.textContent = text;
  nodes.connectionDot.classList.toggle('live', Boolean(live));
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

  if (response.status === 401 && hasSession && attemptRefresh && !path.includes('/api/auth/merchant/refresh')) {
    try {
      await refreshSession();
    } catch {
      clearSessionState();
      throw new Error('Merchant session expired. Please log in again.');
    }
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
    refreshingSession = request('/api/auth/merchant/refresh', { method: 'POST' }, false)
      .then(() => {
        hasSession = true;
      })
      .catch((error) => {
        clearSessionState();
        throw error;
      })
      .finally(() => {
        refreshingSession = null;
      });
  }
  return refreshingSession;
}

function populateRestaurantSelect() {
  nodes.restaurantSelect.innerHTML = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  syncSelectedRestaurant();
}

function syncSelectedRestaurant() {
  const restaurant = currentRestaurant();
  if (!restaurant) {
    nodes.selectedStoreSummary.textContent = 'Select a store to review its current settings and staff setup.';
    return;
  }
  nodes.restaurantSelect.value = restaurant.id;
  document.getElementById('showPickedUpAsInTransit').checked = Boolean(restaurant.trackingSettings.showPickedUpAsInTransit);
  document.getElementById('showDriverEtaToPickup').checked = Boolean(restaurant.trackingSettings.showDriverEtaToPickup);
  document.getElementById('showDestinationEta').checked = Boolean(restaurant.trackingSettings.showDestinationEta);
  document.getElementById('driverOfferDistanceMode').value = restaurant.driverOfferSettings?.distanceMode || 'storeToCustomer';
  nodes.selectedStoreSummary.innerHTML = `
    <strong>${restaurant.name}</strong>
    <div>${restaurant.pickupLocation.address}</div>
    <div>Commercial currency: ${normalizeCurrencyCode(restaurant.currency)}</div>
    <div>Distance unit: ${restaurant.distanceUnit === 'mile' ? 'Miles (mi)' : 'Kilometers (km)'}</div>
    <div>Store billing: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div>
    <div>Tracking view: pickup ETA ${restaurant.trackingSettings.showDriverEtaToPickup ? 'visible' : 'hidden'}, destination ETA ${restaurant.trackingSettings.showDestinationEta ? 'visible' : 'hidden'}</div>
    <div>Driver app offer view: ${restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute to store plus delivery' : 'Store to customer only'}</div>
  `;
  nodes.billingSummary.textContent = summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit);
}

function renderRestaurantCards(groups, report) {
  nodes.statStores.textContent = report.totalRestaurants;
  nodes.statOrders.textContent = report.totalOrders;
  nodes.statCharges.textContent = summarizeCurrencyTotals(groups, 'companyCharge');
  nodes.restaurants.innerHTML = groups.map((group) => `
    <article class="card">
      <div class="section-head"><strong>${group.restaurant.name}</strong><span class="pill">${group.orders.length} orders</span></div>
      <div class="muted">${group.restaurant.pickupLocation.address}</div>
      <div class="muted">Currency: ${normalizeCurrencyCode(group.restaurant.currency)} | Distance unit: ${group.restaurant.distanceUnit === 'mile' ? 'Miles' : 'Kilometers'}</div>
      <div class="muted">Store billing: ${summarizePricingRule(group.restaurant.pricing.merchantBillingRule, group.restaurant.currency, group.restaurant.distanceUnit)}</div>
      <div class="muted">Pickup ETA ${group.restaurant.trackingSettings.showDriverEtaToPickup ? 'visible' : 'hidden'} | Destination ETA ${group.restaurant.trackingSettings.showDestinationEta ? 'visible' : 'hidden'}</div>
      <div class="muted">Driver app offer: ${group.restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute + delivery' : 'Store to customer only'}</div>
    </article>
  `).join('') || '<div class="muted">No stores assigned.</div>';
}

function renderOrders(groups) {
  const rows = groups.flatMap((group) => group.orders.map((order) => ({ order, restaurant: group.restaurant })));
  nodes.orders.innerHTML = rows.map(({ order, restaurant }) => `
    <article class="card">
      <div class="section-head"><strong>${restaurant.name}</strong><span class="pill">${formatStatus(order.tracking.displayStatus)}</span></div>
      <div>${order.customer.name}</div>
      <div class="muted">${order.customer.address}</div>
      <div class="muted">Courier: ${order.tracking.assignedDriverName || 'Waiting'} | Pickup ETA: ${formatMinutes(order.tracking.driverEtaToPickupMinutes)} | Destination ETA: ${formatMinutes(order.tracking.destinationEtaMinutes)} | ETA source: ${formatEtaSource(order.tracking.etaSource)}</div>
      <div class="muted">Store charge: ${formatMoney(order.companyCharge, order.displayCurrency || restaurant.currency)}</div>
      <div class="muted">Driver app distance: ${formatDistance(order.driverDisplayDistanceKm, order.driverDisplayDistanceUnit || restaurant.distanceUnit)}</div>
    </article>
  `).join('') || '<div class="muted">No merchant-wide orders yet.</div>';
}

async function refreshStaffList() {
  const restaurantId = nodes.restaurantSelect.value;
  if (!restaurantId || !hasSession) {
    nodes.staffList.innerHTML = '';
    return;
  }
  const staffUsers = await request(`/api/merchant/me/restaurants/${restaurantId}/staff-users`);
  nodes.staffList.innerHTML = staffUsers.map((user) => `
    <article class="card">
      <strong>${user.name}</strong>
      <div class="muted">${user.email}</div>
      <div class="muted">${user.role} | ${user.isActive ? 'Active' : 'Inactive'}</div>
    </article>
  `).join('') || '<div class="muted">No staff users yet.</div>';
}

async function refreshDashboard() {
  try {
    const [profile, report, restaurantList, orderGroups] = await Promise.all([
      request('/api/merchant/me/profile', {}, false),
      request('/api/merchant/me/report', {}, false),
      request('/api/merchant/me/restaurants', {}, false),
      request('/api/merchant/me/orders', {}, false),
    ]);
    hasSession = true;
    restaurants = restaurantList;
    nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
    populateRestaurantSelect();
    renderRestaurantCards(orderGroups, report);
    renderOrders(orderGroups);
    await refreshStaffList();
  } catch (error) {
    hasSession = false;
    nodes.sessionStatus.textContent = 'Not logged in';
    nodes.restaurants.innerHTML = '<div class="muted">Login to load merchant stores.</div>';
    nodes.orders.innerHTML = '';
    nodes.staffList.innerHTML = '';
    nodes.statStores.textContent = '0';
    nodes.statOrders.textContent = '0';
    nodes.statCharges.textContent = '--';
    nodes.restaurantSelect.innerHTML = '';
    setConnectionState('Waiting for merchant session.', false);
    throw error;
  }
}

function stopStream() {
  if (stream) {
    stream.close();
    stream = null;
  }
}

async function connectStream() {
  stopStream();
  if (!hasSession) return;
  try {
    const { ticket } = await request('/api/auth/merchant/stream-ticket', { method: 'POST' });
    stream = new EventSource(`/api/merchant/me/stream?ticket=${encodeURIComponent(ticket)}`);
  } catch (error) {
    setConnectionState('Realtime link unavailable. Refresh or log in again.', false);
    throw error;
  }
  setConnectionState('Connecting to live merchant updates...', false);
  stream.addEventListener('ready', () => setConnectionState('Live merchant updates connected.', true));
  stream.addEventListener('restaurant-updated', () => {
    refreshDashboard().catch((error) => console.error(error));
  });
  stream.addEventListener('ping', () => setConnectionState('Live merchant updates connected.', true));
  stream.onerror = () => {
    setConnectionState('Realtime link interrupted. Reconnecting...', false);
    stopStream();
    setTimeout(() => connectStream().catch((error) => console.error(error)), 2000);
  };
}

async function login() {
  await request('/api/auth/merchant/login', {
    method: 'POST',
    body: JSON.stringify({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value.trim(),
    }),
  }, false);
  hasSession = true;
  await refreshDashboard();
  await connectStream();
}

async function logout() {
  try {
    if (hasSession) {
      await request('/api/auth/merchant/logout', { method: 'POST' }, false);
    }
  } finally {
    hasSession = false;
    stopStream();
    await refreshDashboard().catch(() => {});
  }
}

async function saveTracking() {
  const restaurant = currentRestaurant();
  if (!restaurant) return;
  await request(`/api/merchant/me/restaurants/${restaurant.id}/tracking-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      showPickedUpAsInTransit: document.getElementById('showPickedUpAsInTransit').checked,
      showDriverEtaToPickup: document.getElementById('showDriverEtaToPickup').checked,
      showDestinationEta: document.getElementById('showDestinationEta').checked,
    }),
  });
  await request(`/api/merchant/me/restaurants/${restaurant.id}/driver-offer-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      distanceMode: document.getElementById('driverOfferDistanceMode').value,
    }),
  });
  nodes.trackingStatus.textContent = 'Store tracking and driver app display updated.';
  await refreshDashboard();
}

async function createStaffUser() {
  const restaurantId = nodes.restaurantSelect.value;
  await request(`/api/merchant/me/restaurants/${restaurantId}/staff-users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('staffName').value.trim(),
      email: document.getElementById('staffEmail').value.trim(),
      password: document.getElementById('staffPassword').value,
      role: document.getElementById('staffRole').value,
    }),
  });
  nodes.staffStatus.textContent = 'Store staff account created.';
  await refreshStaffList();
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => alert(error.message)));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => alert(error.message)));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) alert(error.message); }));
document.getElementById('saveTrackingBtn').addEventListener('click', () => saveTracking().catch((error) => { nodes.trackingStatus.textContent = error.message; }));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { nodes.staffStatus.textContent = error.message; }));
nodes.restaurantSelect.addEventListener('change', () => {
  syncSelectedRestaurant();
  refreshStaffList().catch((error) => { nodes.staffStatus.textContent = error.message; });
});

refreshDashboard().then(() => connectStream()).catch(() => {});
setInterval(() => {
  if (hasSession) {
    refreshSession().catch(() => {});
  }
}, 10 * 60 * 1000);
