const apiBase = '';
let hasSession = false;
let stream = null;
let refreshingSession = null;
let restaurants = [];
let latestReport = null;
let latestOrderGroups = [];
let currentView = 'dashboard';
let currentProfile = null;
let reportFilterState = {
  preset: 'last30',
  startDate: '',
  endDate: '',
};

const MILES_PER_KILOMETER = 0.621371;
const KILOMETERS_PER_MILE = 1.609344;

const nodes = {
  connectionDot: document.getElementById('connectionDot'),
  connectionText: document.getElementById('connectionText'),
  sessionStatus: document.getElementById('sessionStatus'),
  loginControls: document.getElementById('loginControls'),
  activeSessionCard: document.getElementById('activeSessionCard'),
  activeSessionMeta: document.getElementById('activeSessionMeta'),
  restaurantSelect: document.getElementById('restaurantSelect'),
  trackingStatus: document.getElementById('trackingStatus'),
  staffStatus: document.getElementById('staffStatus'),
  staffList: document.getElementById('staffList'),
  restaurants: document.getElementById('restaurants'),
  orders: document.getElementById('orders'),
  billingSummary: document.getElementById('billingSummary'),
  selectedStoreSummary: document.getElementById('selectedStoreSummary'),
  statStores: document.getElementById('statStores'),
  statOrders: document.getElementById('statOrders'),
  statActiveOrders: document.getElementById('statActiveOrders'),
  statCharges: document.getElementById('statCharges'),
  reportDelivered: document.getElementById('reportDelivered'),
  reportActiveShare: document.getElementById('reportActiveShare'),
  reportAverageCharge: document.getElementById('reportAverageCharge'),
  reportOrdersPerStore: document.getElementById('reportOrdersPerStore'),
  reportStoreVolume: document.getElementById('reportStoreVolume'),
  reportStoreCharges: document.getElementById('reportStoreCharges'),
  reportStatusMix: document.getElementById('reportStatusMix'),
  dashboardView: document.getElementById('dashboardView'),
  reportsView: document.getElementById('reportsView'),
  operationsView: document.getElementById('operationsView'),
  reportPreset: document.getElementById('reportPreset'),
  reportStartDate: document.getElementById('reportStartDate'),
  reportEndDate: document.getElementById('reportEndDate'),
  reportRangeNote: document.getElementById('reportRangeNote'),
  authGate: document.getElementById('authGate'),
  mainLayout: document.getElementById('mainLayout'),
  gateEmail: document.getElementById('gateEmail'),
  gatePassword: document.getElementById('gatePassword'),
  gateStatus: document.getElementById('gateStatus'),
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

function computeStatusCounts(groups) {
  const counts = { queued: 0, assigned: 0, atStore: 0, inTransit: 0, delivered: 0 };
  for (const group of groups) {
    for (const order of group.orders) {
      if (order.status === 'queued') counts.queued += 1;
      else if (order.status === 'pending' || order.status === 'accepted') counts.assigned += 1;
      else if (order.status === 'atRestaurant') counts.atStore += 1;
      else if (order.status === 'pickedUp') counts.inTransit += 1;
      else if (order.status === 'delivered') counts.delivered += 1;
    }
  }
  return counts;
}

function activeOrderCount(groups) {
  return groups.reduce((sum, group) => sum + group.orders.filter((order) => order.status !== 'delivered').length, 0);
}

function summarizeCurrencyTotals(groups, field) {
  const totals = new Map();
  for (const group of groups) {
    const currencyCode = normalizeCurrencyCode(group.restaurant.currency || 'AED');
    const total = group.orders.reduce((sum, order) => sum + Number(order[field] || 0), 0);
    totals.set(currencyCode, (totals.get(currencyCode) || 0) + total);
  }
  if (!totals.size) return formatMoney(0, 'AED');
  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([currencyCode, amount]) => formatMoney(amount, currencyCode))
    .join(' / ') || formatMoney(0, 'AED');
}

function averageCharge(groups) {
  const allOrders = groups.flatMap((group) => group.orders.map((order) => ({ order, currency: group.restaurant.currency })));
  if (!allOrders.length) return '--';
  const sameCurrency = allOrders.every((entry) => normalizeCurrencyCode(entry.currency) === normalizeCurrencyCode(allOrders[0].currency));
  if (!sameCurrency) return 'Mixed currencies';
  const total = allOrders.reduce((sum, entry) => sum + Number(entry.order.companyCharge || 0), 0);
  return formatMoney(total / allOrders.length, allOrders[0].currency);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setConnectionState(text, live) {
  nodes.connectionText.textContent = text;
  nodes.connectionDot.classList.toggle('live', Boolean(live));
}

function setView(view) {
  currentView = view;
  nodes.dashboardView.classList.toggle('active', view === 'dashboard');
  nodes.reportsView.classList.toggle('active', view === 'reports');
  nodes.operationsView.classList.toggle('active', view === 'operations');
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

function renderEmpty(target, message) {
  target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function setSessionUi() {
  nodes.authGate.classList.toggle('hidden', hasSession);
  nodes.mainLayout.classList.toggle('hidden', !hasSession);
  nodes.loginControls.classList.toggle('hidden', hasSession);
  nodes.activeSessionCard.classList.toggle('hidden', !hasSession);
  if (!hasSession || !currentProfile) {
    nodes.activeSessionMeta.innerHTML = '';
    return;
  }
  nodes.activeSessionMeta.innerHTML = `
    <strong>${escapeHtml(currentProfile.name)}</strong>
    <div class="muted">Merchant workspace is live and refreshing automatically.</div>
  `;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateOffsetIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStartIso() {
  const date = new Date();
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}

function getActiveRange() {
  const preset = reportFilterState.preset;
  if (preset === 'all') return {};
  if (preset === 'today') {
    const today = todayIso();
    return { startDate: today, endDate: today };
  }
  if (preset === 'last7') return { startDate: dateOffsetIso(-6), endDate: todayIso() };
  if (preset === 'last30') return { startDate: dateOffsetIso(-29), endDate: todayIso() };
  if (preset === 'thisMonth') return { startDate: monthStartIso(), endDate: todayIso() };
  return {
    startDate: reportFilterState.startDate || undefined,
    endDate: reportFilterState.endDate || undefined,
  };
}

function rangeQueryString() {
  const params = new URLSearchParams();
  const range = getActiveRange();
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function updateFilterInputs() {
  nodes.reportPreset.value = reportFilterState.preset;
  const custom = reportFilterState.preset === 'custom';
  nodes.reportStartDate.disabled = !custom;
  nodes.reportEndDate.disabled = !custom;
  if (!custom) {
    const range = getActiveRange();
    nodes.reportStartDate.value = range.startDate || '';
    nodes.reportEndDate.value = range.endDate || '';
  } else {
    nodes.reportStartDate.value = reportFilterState.startDate || '';
    nodes.reportEndDate.value = reportFilterState.endDate || '';
  }
  const range = getActiveRange();
  if (!range.startDate && !range.endDate) {
    nodes.reportRangeNote.textContent = 'Showing all available dates.';
  } else if (range.startDate && range.endDate) {
    nodes.reportRangeNote.textContent = `Showing data from ${range.startDate} to ${range.endDate}.`;
  } else {
    nodes.reportRangeNote.textContent = `Showing data ${range.startDate ? `from ${range.startDate}` : `until ${range.endDate}`}.`;
  }
}

function clearSessionState(message = 'Merchant session expired. Please log in again.') {
  hasSession = false;
  currentProfile = null;
  stopStream();
  restaurants = [];
  latestReport = null;
  latestOrderGroups = [];
  nodes.sessionStatus.textContent = message;
  nodes.gateStatus.textContent = message;
  nodes.billingSummary.textContent = 'Select a store to review its billing terms.';
  nodes.trackingStatus.textContent = 'Update how restaurant staff see delivery progress for this store.';
  nodes.staffStatus.textContent = 'Create and review staff users for the selected store.';
  nodes.selectedStoreSummary.textContent = 'Select a store to review its current settings and reporting snapshot.';
  renderEmpty(nodes.restaurants, 'Login to load merchant stores.');
  renderEmpty(nodes.orders, 'Login to load live orders.');
  renderEmpty(nodes.staffList, 'Login to review store staff.');
  renderEmpty(nodes.reportStoreVolume, 'Login to see store-volume reporting.');
  renderEmpty(nodes.reportStoreCharges, 'Login to see billing reporting.');
  renderEmpty(nodes.reportStatusMix, 'Login to see operational metrics.');
  nodes.restaurantSelect.innerHTML = '';
  nodes.statStores.textContent = '0';
  nodes.statOrders.textContent = '0';
  nodes.statActiveOrders.textContent = '0';
  nodes.statCharges.textContent = '--';
  nodes.reportDelivered.textContent = '0';
  nodes.reportActiveShare.textContent = '0%';
  nodes.reportAverageCharge.textContent = '--';
  nodes.reportOrdersPerStore.textContent = '0';
  setConnectionState('Waiting for merchant session.', false);
  setSessionUi();
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
      .then(() => { hasSession = true; })
      .catch((error) => {
        clearSessionState();
        throw error;
      })
      .finally(() => { refreshingSession = null; });
  }
  return refreshingSession;
}

function populateRestaurantSelect() {
  nodes.restaurantSelect.innerHTML = restaurants.map((restaurant) => `<option value="${restaurant.id}">${escapeHtml(restaurant.name)}</option>`).join('');
  syncSelectedRestaurant();
}

function syncSelectedRestaurant() {
  const restaurant = currentRestaurant();
  if (!restaurant) {
    nodes.selectedStoreSummary.textContent = 'Select a store to review its current settings and reporting snapshot.';
    return;
  }
  nodes.restaurantSelect.value = restaurant.id;
  document.getElementById('showPickedUpAsInTransit').checked = Boolean(restaurant.trackingSettings.showPickedUpAsInTransit);
  document.getElementById('showDriverEtaToPickup').checked = Boolean(restaurant.trackingSettings.showDriverEtaToPickup);
  document.getElementById('showDestinationEta').checked = Boolean(restaurant.trackingSettings.showDestinationEta);
  document.getElementById('driverOfferDistanceMode').value = restaurant.driverOfferSettings?.distanceMode || 'storeToCustomer';
  const ordersForStore = latestOrderGroups.find((group) => group.restaurant.id === restaurant.id)?.orders || [];
  const liveForStore = ordersForStore.filter((order) => order.status !== 'delivered').length;
  nodes.selectedStoreSummary.innerHTML = `
    <div><strong>${escapeHtml(restaurant.name)}</strong></div>
    <div>${escapeHtml(restaurant.pickupLocation.address)}</div>
    <div>Commercial currency: ${normalizeCurrencyCode(restaurant.currency)}</div>
    <div>Distance unit: ${restaurant.distanceUnit === 'mile' ? 'Miles (mi)' : 'Kilometers (km)'}</div>
    <div>Store billing: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div>
    <div>Open orders now: <span class="accent-value">${liveForStore}</span></div>
    <div>Driver app offer view: ${restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute to store plus delivery' : 'Store to customer only'}</div>
  `;
  nodes.billingSummary.textContent = summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit);
}

function renderRestaurantCards(groups, report) {
  nodes.statStores.textContent = String(report.totalRestaurants || 0);
  nodes.statOrders.textContent = String(report.totalOrders || 0);
  nodes.statActiveOrders.textContent = String(activeOrderCount(groups));
  nodes.statCharges.textContent = summarizeCurrencyTotals(groups, 'companyCharge');
  if (!groups.length) {
    renderEmpty(nodes.restaurants, 'No stores assigned to this merchant yet.');
    return;
  }
  nodes.restaurants.innerHTML = groups.map((group) => {
    const liveOrders = group.orders.filter((order) => order.status !== 'delivered').length;
    const deliveredOrders = group.orders.filter((order) => order.status === 'delivered').length;
    const totalCharges = group.orders.reduce((sum, order) => sum + Number(order.companyCharge || 0), 0);
    return `
      <article class="store-tile ${nodes.restaurantSelect.value === group.restaurant.id ? 'highlight' : ''}">
        <div class="eyebrow">${liveOrders > 0 ? 'Live activity' : 'Portfolio store'}</div>
        <h4>${escapeHtml(group.restaurant.name)}</h4>
        <div class="muted">${escapeHtml(group.restaurant.pickupLocation.address)}</div>
        <div class="metric-row"><span>Live orders</span><strong>${liveOrders}</strong></div>
        <div class="metric-row"><span>Delivered orders</span><strong>${deliveredOrders}</strong></div>
        <div class="metric-row"><span>Store billing total</span><strong>${formatMoney(totalCharges, group.restaurant.currency)}</strong></div>
        <div class="metric-row"><span>Offer display</span><strong>${group.restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute + delivery' : 'Store to customer only'}</strong></div>
      </article>
    `;
  }).join('');
}

function renderOrders(groups) {
  const rows = groups.flatMap((group) => group.orders.map((order) => ({ order, restaurant: group.restaurant })));
  if (!rows.length) {
    renderEmpty(nodes.orders, 'No merchant-wide orders yet for the selected range.');
    return;
  }
  rows.sort((a, b) => String(b.order.createdAt || '').localeCompare(String(a.order.createdAt || '')));
  nodes.orders.innerHTML = rows.map(({ order, restaurant }) => `
    <article class="order-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">${escapeHtml(restaurant.name)}</div>
          <h4>${escapeHtml(order.customer.name)}</h4>
        </div>
        <span class="pill">${formatStatus(order.tracking.displayStatus)}</span>
      </div>
      <div class="muted">${escapeHtml(order.customer.address)}</div>
      <div class="grid-two" style="margin-top: 12px;">
        <div class="card" style="padding: 14px;">
          <div class="eyebrow">Courier movement</div>
          <div style="margin-top: 8px;">Courier: ${escapeHtml(order.tracking.assignedDriverName || 'Waiting for assignment')}</div>
          <div class="muted">Pickup ETA: ${formatMinutes(order.tracking.driverEtaToPickupMinutes)}</div>
          <div class="muted">Destination ETA: ${formatMinutes(order.tracking.destinationEtaMinutes)}</div>
        </div>
        <div class="card" style="padding: 14px;">
          <div class="eyebrow">Store-facing commercial view</div>
          <div style="margin-top: 8px;">Store charge: ${formatMoney(order.companyCharge, order.displayCurrency || restaurant.currency)}</div>
          <div class="muted">Driver app distance: ${formatDistance(order.driverDisplayDistanceKm, order.driverDisplayDistanceUnit || restaurant.distanceUnit)}</div>
          <div class="muted">ETA source: ${formatEtaSource(order.tracking.etaSource)}</div>
        </div>
      </div>
    </article>
  `).join('');
}

function renderReports(groups, report) {
  const statusCounts = computeStatusCounts(groups);
  nodes.reportDelivered.textContent = String(report.deliveredOrders || 0);
  nodes.reportActiveShare.textContent = report.totalOrders ? `${Math.round((report.activeOrders / report.totalOrders) * 100)}%` : '0%';
  nodes.reportAverageCharge.textContent = averageCharge(groups);
  nodes.reportOrdersPerStore.textContent = report.totalRestaurants ? (report.totalOrders / report.totalRestaurants).toFixed(1) : '0';

  if (!groups.length) {
    renderEmpty(nodes.reportStoreVolume, 'No store data yet for the selected range.');
    renderEmpty(nodes.reportStoreCharges, 'No billing data yet for the selected range.');
    renderEmpty(nodes.reportStatusMix, 'No operational mix yet for the selected range.');
    return;
  }

  const volumeRows = groups.map((group) => ({ name: group.restaurant.name, value: group.orders.length })).sort((a, b) => b.value - a.value);
  const chargeRows = groups.map((group) => ({ name: group.restaurant.name, value: group.orders.reduce((sum, order) => sum + Number(order.companyCharge || 0), 0), currency: group.restaurant.currency })).sort((a, b) => b.value - a.value);

  nodes.reportStoreVolume.innerHTML = volumeRows.map((row) => `<div class="list-row"><span>${escapeHtml(row.name)}</span><strong>${row.value}</strong></div>`).join('');
  nodes.reportStoreCharges.innerHTML = chargeRows.map((row) => `<div class="list-row"><span>${escapeHtml(row.name)}</span><strong>${formatMoney(row.value, row.currency)}</strong></div>`).join('');
  nodes.reportStatusMix.innerHTML = [
    ['Queued', statusCounts.queued],
    ['Assigned / pending', statusCounts.assigned],
    ['At store', statusCounts.atStore],
    ['In transit', statusCounts.inTransit],
    ['Delivered', statusCounts.delivered],
  ].map(([label, value]) => `<div class="list-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

async function refreshStaffList() {
  const restaurantId = nodes.restaurantSelect.value;
  if (!restaurantId || !hasSession) {
    renderEmpty(nodes.staffList, 'Select a store after login to review staff.');
    return;
  }
  const staffUsers = await request(`/api/merchant/me/restaurants/${restaurantId}/staff-users`);
  if (!staffUsers.length) {
    renderEmpty(nodes.staffList, 'No staff users yet for this store.');
    return;
  }
  nodes.staffList.innerHTML = staffUsers.map((user) => `
    <article class="card">
      <strong>${escapeHtml(user.name)}</strong>
      <div class="muted">${escapeHtml(user.email)}</div>
      <div class="muted">${escapeHtml(user.role)} | ${user.isActive ? 'Active' : 'Inactive'}</div>
    </article>
  `).join('');
}

async function refreshDashboard() {
  try {
    const query = rangeQueryString();
    const [profile, report, restaurantList, orderGroups] = await Promise.all([
      request('/api/merchant/me/profile', {}, false),
      request(`/api/merchant/me/report${query}`, {}, false),
      request('/api/merchant/me/restaurants', {}, false),
      request(`/api/merchant/me/orders${query}`, {}, false),
    ]);
    hasSession = true;
    currentProfile = profile;
    restaurants = restaurantList;
    latestReport = report;
    latestOrderGroups = orderGroups;
    nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
    nodes.gateStatus.textContent = `Logged in as ${profile.name}`;
    setSessionUi();
    populateRestaurantSelect();
    renderRestaurantCards(orderGroups, report);
    renderOrders(orderGroups);
    renderReports(orderGroups, report);
    await refreshStaffList();
  } catch (error) {
    clearSessionState('Not logged in');
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
  stream.addEventListener('restaurant-updated', () => { refreshDashboard().catch((error) => console.error(error)); });
  stream.addEventListener('ping', () => setConnectionState('Live merchant updates connected.', true));
  stream.onerror = () => {
    setConnectionState('Realtime link interrupted. Reconnecting...', false);
    stopStream();
    setTimeout(() => connectStream().catch((error) => console.error(error)), 2000);
  };
}

function getLoginCredentials() {
  const useGate = !hasSession && !nodes.authGate.classList.contains('hidden');
  return {
    email: (useGate ? nodes.gateEmail.value : document.getElementById('email').value).trim(),
    password: useGate ? nodes.gatePassword.value.trim() : document.getElementById('password').value.trim(),
  };
}

async function login() {
  const credentials = getLoginCredentials();
  await request('/api/auth/merchant/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
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
    clearSessionState('Not logged in');
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
    body: JSON.stringify({ distanceMode: document.getElementById('driverOfferDistanceMode').value }),
  });
  nodes.trackingStatus.textContent = 'Store experience settings updated.';
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

function applyReportFilters() {
  reportFilterState = { preset: nodes.reportPreset.value, startDate: nodes.reportStartDate.value, endDate: nodes.reportEndDate.value };
  updateFilterInputs();
  return refreshDashboard();
}

function resetReportFilters() {
  reportFilterState = { preset: 'last30', startDate: '', endDate: '' };
  updateFilterInputs();
  return refreshDashboard();
}

function exportReport() {
  if (!hasSession) {
    nodes.sessionStatus.textContent = 'Log in first to export the report.';
    return;
  }
  window.location.href = `/api/merchant/me/report-export.csv${rangeQueryString()}`;
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('gateLoginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => { nodes.sessionStatus.textContent = error.message; }));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) nodes.sessionStatus.textContent = error.message; }));
document.getElementById('saveTrackingBtn').addEventListener('click', () => saveTracking().catch((error) => { nodes.trackingStatus.textContent = error.message; }));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { nodes.staffStatus.textContent = error.message; }));
document.getElementById('applyReportFiltersBtn').addEventListener('click', () => applyReportFilters().catch((error) => { nodes.reportRangeNote.textContent = error.message; }));
document.getElementById('resetReportFiltersBtn').addEventListener('click', () => resetReportFilters().catch((error) => { nodes.reportRangeNote.textContent = error.message; }));
document.getElementById('exportReportBtn').addEventListener('click', exportReport);
nodes.reportPreset.addEventListener('change', () => {
  reportFilterState.preset = nodes.reportPreset.value;
  if (reportFilterState.preset !== 'custom') {
    reportFilterState.startDate = '';
    reportFilterState.endDate = '';
  }
  updateFilterInputs();
});
nodes.restaurantSelect.addEventListener('change', () => {
  syncSelectedRestaurant();
  refreshStaffList().catch((error) => { nodes.staffStatus.textContent = error.message; });
});
document.querySelectorAll('[data-view]').forEach((button) => { button.addEventListener('click', () => setView(button.dataset.view)); });

clearSessionState('Not logged in');
updateFilterInputs();
setView(currentView);
refreshDashboard().then(() => connectStream()).catch(() => {});
setInterval(() => {
  if (hasSession) {
    refreshSession().catch(() => {});
  }
}, 10 * 60 * 1000);
