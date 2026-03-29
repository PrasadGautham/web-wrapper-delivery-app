import { resolveLoginCredentials } from './shared/auth.js';
import { describeDateRange, resolveDateRange } from './shared/date-range.js';
import { renderEmpty } from './shared/dom.js';
import { DEFAULT_CURRENCY_CODE, DEFAULT_PLATFORM_TIME_ZONE } from './shared/constants.js';
import { escapeHtml, formatEtaSource, formatMinutes, formatMoney, formatStatus } from './shared/formatting.js';

const apiBase = '';
let hasSession = false;
let stream = null;
let refreshingSession = null;
let currentProfile = null;
let currentReport = null;
let currentOrders = [];
let currentView = 'dashboard';
let reportFilterState = { preset: 'last30', startDate: '', endDate: '' };
let sessionEpoch = 0;

const nodes = {
  sessionStatus: document.getElementById('sessionStatus'),
  connectionText: document.getElementById('connectionText'),
  connectionDot: document.getElementById('connectionDot'),
  trackingSettings: document.getElementById('trackingSettings'),
  storeSummary: document.getElementById('storeSummary'),
  resetStatus: document.getElementById('resetStatus'),
  statTotal: document.getElementById('statTotal'),
  statActive: document.getElementById('statActive'),
  statDelivered: document.getElementById('statDelivered'),
  statCharges: document.getElementById('statCharges'),
  reportCompletionRate: document.getElementById('reportCompletionRate'),
  reportAverageCharge: document.getElementById('reportAverageCharge'),
  reportActiveShare: document.getElementById('reportActiveShare'),
  reportTrackingMode: document.getElementById('reportTrackingMode'),
  reportStatusMix: document.getElementById('reportStatusMix'),
  reportBillingSummary: document.getElementById('reportBillingSummary'),
  reportCourierSummary: document.getElementById('reportCourierSummary'),
  reportDailyVolume: document.getElementById('reportDailyVolume'),
  reportTrackingSummary: document.getElementById('reportTrackingSummary'),
  orders: document.getElementById('orders'),
  resetPanel: document.getElementById('resetPanel'),
  dashboardView: document.getElementById('dashboardView'),
  reportsView: document.getElementById('reportsView'),
  createOrderView: document.getElementById('createOrderView'),
  loginControls: document.getElementById('loginControls'),
  activeSessionCard: document.getElementById('activeSessionCard'),
  activeSessionMeta: document.getElementById('activeSessionMeta'),
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

const currency = formatMoney;

function setConnectionState(text, live) {
  nodes.connectionText.textContent = text;
  nodes.connectionDot.classList.toggle('live', Boolean(live));
}

function setView(view) {
  currentView = view;
  nodes.dashboardView.classList.toggle('active', view === 'dashboard');
  nodes.reportsView.classList.toggle('active', view === 'reports');
  nodes.createOrderView.classList.toggle('active', view === 'create-order');
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
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
  nodes.activeSessionMeta.innerHTML = `<strong>${escapeHtml(currentProfile.name)}</strong><div class="muted">Store session is live and refreshing automatically.</div>`;
}

function statusCounts(orders) {
  const counts = { queued: 0, assigned: 0, atStore: 0, inTransit: 0, delivered: 0 };
  for (const order of orders) {
    if (order.status === 'queued') counts.queued += 1;
    else if (order.status === 'pending' || order.status === 'accepted') counts.assigned += 1;
    else if (order.status === 'atRestaurant') counts.atStore += 1;
    else if (order.status === 'pickedUp') counts.inTransit += 1;
    else if (order.status === 'delivered') counts.delivered += 1;
  }
  return counts;
}

function averageCharge(orders) {
  if (!orders.length) return '--';
  const total = orders.reduce((sum, order) => sum + Number(order.companyCharge || 0), 0);
  return currency(total / orders.length, currentProfile?.currency);
}

function getActiveRange() {
  return resolveDateRange(reportFilterState, currentProfile?.timeZone || DEFAULT_PLATFORM_TIME_ZONE);
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
  nodes.reportRangeNote.textContent = `${describeDateRange(range, currentProfile?.timeZone || DEFAULT_PLATFORM_TIME_ZONE)} Time zone: ${currentProfile?.timeZone || DEFAULT_PLATFORM_TIME_ZONE}.`;
}

async function request(path, options = {}, attemptRefresh = true) {
  const headers = { 'X-Portal-Client': 'web', ...(options.headers || {}) };
  if (options.body != null && !Object.prototype.hasOwnProperty.call(headers, 'Content-Type')) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && hasSession && attemptRefresh && !path.includes('/auth/restaurant/refresh')) {
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
    refreshingSession = request('/api/auth/restaurant/refresh', { method: 'POST' }, false)
      .then(() => { hasSession = true; })
      .catch((error) => { hasSession = false; stopStream(); throw error; })
      .finally(() => { refreshingSession = null; });
  }
  return refreshingSession;
}

function renderTrackingSettings(profile) {
  const settings = profile?.trackingSettings;
  if (!settings) { nodes.trackingSettings.textContent = 'No active store session.'; return; }
  nodes.trackingSettings.innerHTML = [
    `Pickup status shown as In transit: <strong>${settings.showPickedUpAsInTransit ? 'On' : 'Off'}</strong>`,
    `Show courier ETA to pickup: <strong>${settings.showDriverEtaToPickup ? 'On' : 'Off'}</strong>`,
    `Show destination ETA after pickup: <strong>${settings.showDestinationEta ? 'On' : 'Off'}</strong>`,
  ].join('<br />');
}

function renderOrders(orders) {
  if (!orders.length) { renderEmpty(nodes.orders, 'No orders yet for this store in the selected range.'); return; }
  nodes.orders.innerHTML = orders.map((order) => `
    <article class="order-card">
      <div class="section-head"><div><div class="eyebrow">${escapeHtml(order.deliveryArea || 'Delivery')}</div><h3 style="margin: 4px 0 0;">${escapeHtml(order.customer.name)}</h3></div><span class="pill">${formatStatus(order.tracking.displayStatus)}</span></div>
      <div class="muted">${escapeHtml(order.customer.address)}</div>
      <div class="order-grid">
        <div class="card" style="padding: 14px;"><div class="eyebrow">Courier</div><div style="margin-top: 8px;">${escapeHtml(order.tracking.assignedDriverName || 'Waiting for courier assignment')}</div><div class="muted">Pickup ETA: ${formatMinutes(order.tracking.driverEtaToPickupMinutes)}</div></div>
        <div class="card" style="padding: 14px;"><div class="eyebrow">Destination</div><div style="margin-top: 8px;">ETA: ${formatMinutes(order.tracking.destinationEtaMinutes)}</div><div class="muted">ETA source: ${formatEtaSource(order.tracking.etaSource)}</div></div>
        <div class="card" style="padding: 14px;"><div class="eyebrow">Store charge</div><div style="margin-top: 8px;">${currency(order.companyCharge, order.displayCurrency || currentProfile?.currency)}</div><div class="muted">Store-facing commercial amount for this trip</div></div>
      </div>
    </article>
  `).join('');
}

function renderReports(profile, report, orders) {
  const completionRate = report.totalOrders ? Math.round((report.deliveredOrders / report.totalOrders) * 100) : 0;
  const activeShare = report.totalOrders ? Math.round((report.activeOrders / report.totalOrders) * 100) : 0;
  nodes.reportCompletionRate.textContent = `${completionRate}%`;
  nodes.reportAverageCharge.textContent = averageCharge(orders);
  nodes.reportActiveShare.textContent = `${activeShare}%`;
  nodes.reportTrackingMode.textContent = profile?.trackingSettings?.showPickedUpAsInTransit ? 'In transit after pickup' : 'Picked up after pickup';
  nodes.reportStatusMix.innerHTML = (report.statusMix || []).map((row) => `<div class="list-row"><span>${escapeHtml(row.status)}</span><strong>${row.count}</strong></div>`).join('') || '<div class="muted">No orders yet.</div>';
  nodes.reportBillingSummary.innerHTML = [['Store charge total', currency(report.totalRestaurantCharges, profile?.currency)], ['Average charge per order', averageCharge(orders)], ['Commercial currency', String(profile?.currency || DEFAULT_CURRENCY_CODE).toUpperCase()], ['Time zone', profile?.timeZone || DEFAULT_PLATFORM_TIME_ZONE], ['Distance unit', profile?.distanceUnit === 'mile' ? 'Miles (mi)' : 'Kilometers (km)']].map(([label, value]) => `<div class="list-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
  nodes.reportCourierSummary.innerHTML = (report.byCourier || []).map((row) => `<div class="list-row"><span>${escapeHtml(row.driverName)}</span><strong>${row.totalOrders} orders</strong></div>`).join('') || '<div class="muted">No courier data yet.</div>';
  nodes.reportDailyVolume.innerHTML = (report.byDay || []).map((row) => `<div class="list-row"><span>${row.date}</span><strong>${row.totalOrders}</strong></div>`).join('') || '<div class="muted">No day-by-day activity yet.</div>';
  nodes.reportTrackingSummary.innerHTML = [['Post-pickup status label', profile?.trackingSettings?.showPickedUpAsInTransit ? 'In transit' : 'Picked up'], ['Pickup ETA visible', profile?.trackingSettings?.showDriverEtaToPickup ? 'Yes' : 'No'], ['Destination ETA visible', profile?.trackingSettings?.showDestinationEta ? 'Yes' : 'No']].map(([label, value]) => `<div class="list-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function clearDashboard() {
  sessionEpoch += 1;
  currentProfile = null;
  currentReport = null;
  currentOrders = [];
  nodes.sessionStatus.textContent = 'Not logged in';
  nodes.gateStatus.textContent = 'Not logged in';
  nodes.storeSummary.textContent = 'No active store session.';
  renderTrackingSettings(null);
  nodes.statTotal.textContent = '0';
  nodes.statActive.textContent = '0';
  nodes.statDelivered.textContent = '0';
  nodes.statCharges.textContent = '--';
  nodes.reportCompletionRate.textContent = '0%';
  nodes.reportAverageCharge.textContent = '--';
  nodes.reportActiveShare.textContent = '0%';
  nodes.reportTrackingMode.textContent = '--';
  renderEmpty(nodes.orders, 'Login to load store orders.');
  renderEmpty(nodes.reportStatusMix, 'Login to see status reporting.');
  renderEmpty(nodes.reportBillingSummary, 'Login to see store billing reporting.');
  renderEmpty(nodes.reportCourierSummary, 'Login to see courier reporting.');
  renderEmpty(nodes.reportDailyVolume, 'Login to see daily order reporting.');
  renderEmpty(nodes.reportTrackingSummary, 'Login to see tracking settings reporting.');
  setConnectionState('Waiting for restaurant session.', false);
  setSessionUi();
}

async function bootstrapSession() {
  const session = await request('/api/auth/restaurant/session', {}, false);
  if (!session.authenticated) {
    hasSession = false;
    clearDashboard();
    return false;
  }
  hasSession = true;
  currentProfile = session;
  nodes.sessionStatus.textContent = `Logged in as ${session.name}`;
  nodes.gateStatus.textContent = `Logged in as ${session.name}`;
  setSessionUi();
  return true;
}

async function refreshDashboard() {
  const epoch = sessionEpoch;
  try {
    const query = rangeQueryString();
    const [profile, report, orders] = await Promise.all([
      request('/api/restaurants/me/profile', {}, false),
      request(`/api/restaurants/me/report${query}`, {}, false),
      request(`/api/restaurants/me/orders${query}`, {}, false),
    ]);
    hasSession = true;
    currentProfile = profile;
    currentReport = report;
    if (epoch !== sessionEpoch || !hasSession) return;
    currentOrders = orders;
    nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
    nodes.gateStatus.textContent = `Logged in as ${profile.name}`;
    nodes.storeSummary.innerHTML = `<div><strong>${escapeHtml(profile.name)}</strong></div><div>${escapeHtml(profile.pickupLocation.address)}</div><div>Commercial currency: ${String(profile.currency || DEFAULT_CURRENCY_CODE).toUpperCase()}</div><div>Time zone: ${profile.timeZone || DEFAULT_PLATFORM_TIME_ZONE}</div><div>Distance unit: ${profile.distanceUnit === 'mile' ? 'Miles (mi)' : 'Kilometers (km)'}</div><div class="success">Store charge visibility only. Courier pay remains private to the fleet company.</div>`;
    nodes.statTotal.textContent = String(report.totalOrders || 0);
    nodes.statActive.textContent = String(report.activeOrders || 0);
    nodes.statDelivered.textContent = String(report.deliveredOrders || 0);
    nodes.statCharges.textContent = currency(report.totalRestaurantCharges, profile.currency);
    renderTrackingSettings(profile);
    renderOrders(orders);
    renderReports(profile, report, orders);
    setSessionUi();
  } catch (error) {
    hasSession = false;
    clearDashboard();
    throw error;
  }
}

function stopStream() { if (stream) { stream.close(); stream = null; } }

async function connectStream() {
  stopStream();
  if (!hasSession) return;
  const epoch = sessionEpoch;
  try {
    const { ticket } = await request('/api/auth/restaurant/stream-ticket', { method: 'POST' });
    stream = new EventSource(`/api/restaurants/me/stream?ticket=${encodeURIComponent(ticket)}`);
    setConnectionState('Connecting to live restaurant updates...', false);
    stream.addEventListener('ready', () => { if (epoch === sessionEpoch && hasSession) setConnectionState('Live restaurant updates connected.', true); });
    stream.addEventListener('restaurant-updated', async () => { if (epoch === sessionEpoch && hasSession) await refreshDashboard().catch((error) => console.error(error)); });
    stream.addEventListener('ping', () => { if (epoch === sessionEpoch && hasSession) setConnectionState('Live restaurant updates connected.', true); });
    stream.onerror = () => { if (epoch !== sessionEpoch || !hasSession) return; setConnectionState('Realtime link interrupted. Reconnecting...', false); stopStream(); setTimeout(() => { if (epoch === sessionEpoch && hasSession) connectStream().catch((error) => console.error(error)); }, 2000); };
  } catch (error) {
    setConnectionState(`Realtime unavailable: ${error.message}`, false);
  }
}

function getLoginCredentials() {
  return resolveLoginCredentials({
    gateEmail: nodes.gateEmail,
    gatePassword: nodes.gatePassword,
    email: document.getElementById('email'),
    password: document.getElementById('password'),
  });
}

async function login() {
  await request('/api/auth/restaurant/login', { method: 'POST', body: JSON.stringify(getLoginCredentials()) }, false);
  const authenticated = await bootstrapSession();
  if (!authenticated) throw new Error('Unable to establish restaurant session.');
  await refreshDashboard();
  await connectStream();
}

async function logout() {
  const shouldLogout = hasSession;
  hasSession = false;
  stopStream();
  sessionEpoch += 1;
  try {
    if (shouldLogout) await request('/api/auth/restaurant/logout', { method: 'POST' }, false);
  } finally {
    clearDashboard();
  }
}

async function createOrder() {
  await request('/api/restaurants/me/orders', { method: 'POST', body: JSON.stringify({ customerName: document.getElementById('customerName').value.trim(), customerAddress: document.getElementById('customerAddress').value.trim(), customerLatitude: Number(document.getElementById('customerLatitude').value), customerLongitude: Number(document.getElementById('customerLongitude').value), deliveryArea: document.getElementById('deliveryArea').value.trim() }) });
  await refreshDashboard();
  setView('dashboard');
}

function resetOrderForm() {
  document.getElementById('customerName').value = 'Customer One';
  document.getElementById('customerAddress').value = 'Dubai Marina, Dubai';
  document.getElementById('customerLatitude').value = '25.0845';
  document.getElementById('customerLongitude').value = '55.1417';
  document.getElementById('deliveryArea').value = 'Dubai Marina';
}

async function requestPasswordReset() {
  const email = document.getElementById('resetEmail').value.trim() || document.getElementById('email').value.trim();
  if (!email) { nodes.resetStatus.textContent = 'Enter your restaurant email first.'; return; }
  const result = await request('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ userType: 'restaurant', email }) }, false);
  nodes.resetStatus.textContent = result.debugToken ? `Reset token for local use: ${result.debugToken}` : 'Password reset request submitted.';
}

async function confirmPasswordReset() {
  const token = document.getElementById('resetToken').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  if (!token || !newPassword) { nodes.resetStatus.textContent = 'Provide both the reset token and the new password.'; return; }
  await request('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ userType: 'restaurant', token, newPassword }) }, false);
  nodes.resetStatus.textContent = 'Password updated. You can now log in with the new password.';
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
  if (!hasSession) { nodes.sessionStatus.textContent = 'Log in first to export the report.'; return; }
  window.location.href = `/api/restaurants/me/report-export.csv${rangeQueryString()}`;
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('gateLoginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => { nodes.sessionStatus.textContent = error.message; }));
document.getElementById('manualRefreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { nodes.sessionStatus.textContent = error.message; }));
document.getElementById('createOrderBtn').addEventListener('click', () => createOrder().catch((error) => { nodes.sessionStatus.textContent = error.message; }));
document.getElementById('resetOrderFormBtn').addEventListener('click', resetOrderForm);
document.getElementById('showResetBtn').addEventListener('click', () => { nodes.resetPanel.classList.toggle('hidden'); });
document.getElementById('requestResetBtn').addEventListener('click', () => requestPasswordReset().catch((error) => { nodes.resetStatus.textContent = error.message; }));
document.getElementById('confirmResetBtn').addEventListener('click', () => confirmPasswordReset().catch((error) => { nodes.resetStatus.textContent = error.message; }));
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
document.querySelectorAll('[data-view]').forEach((button) => { button.addEventListener('click', () => setView(button.dataset.view)); });

clearDashboard();
updateFilterInputs();
setView(currentView);
bootstrapSession().then((authenticated) => { if (authenticated) return refreshDashboard().then(() => connectStream()); return null; }).catch(() => {});

