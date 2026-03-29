import {
  distanceUnitShort,
  distanceUnitWord,
  formatMoney,
  fromDisplayDistance,
  fromDisplayRate,
  normalizeCurrencyCode,
  summarizePricingRule,
  toDisplayDistance,
  toDisplayRate,
} from './shared/formatting.js';
import { dateOffsetIso, monthStartIso, todayIso, describeDateRange } from './shared/date-range.js';
import { resolveLoginCredentials } from './shared/auth.js';

const apiBase = '';
let hasSession = false;
let refreshingSession = null;
let sessionInfo = null;
let tenants = [];
let merchants = [];
let restaurants = [];
let drivers = [];
let adminUsers = [];
let selectedTenantId = '';
let latestAdminReport = null;
let reportFilterState = { preset: 'last30', startDate: '', endDate: '' };

const PLATFORM_ROLES = new Set(['platformAdmin', 'opsAdmin', 'supportAdmin', 'billingAdmin']);
const portalSurface = window.location.pathname.includes('/tenant-admin') ? 'tenant' : 'platform';

const nodes = {
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  gateEmail: document.getElementById('gateEmail'),
  gatePassword: document.getElementById('gatePassword'),
  gateStatus: document.getElementById('gateStatus'),
  loginControls: document.getElementById('loginControls'),
  activeSessionCard: document.getElementById('activeSessionCard'),
  activeSessionMeta: document.getElementById('activeSessionMeta'),
  authGate: document.getElementById('authGate'),
  mainLayout: document.getElementById('mainLayout'),
  sessionStatus: document.getElementById('sessionStatus'),
  heroModeLabel: document.getElementById('heroModeLabel'),
  workspaceModePill: document.getElementById('workspaceModePill'),
  tenantContextSelect: document.getElementById('tenantContextSelect'),
  tenantContextSummary: document.getElementById('tenantContextSummary'),
  tenantAdminTenantSelect: document.getElementById('tenantAdminTenantSelect'),
  createMerchantTenantSelect: document.getElementById('createMerchantTenantSelect'),
  createDriverTenantSelect: document.getElementById('createDriverTenantSelect'),
  createRestaurantTenantSelect: document.getElementById('createRestaurantTenantSelect'),
  createRestaurantMerchantSelect: document.getElementById('createRestaurantMerchantSelect'),
  merchantSelect: document.getElementById('merchantSelect'),
  restaurantSelect: document.getElementById('restaurantSelect'),
  settingsRestaurantSelect: document.getElementById('settingsRestaurantSelect'),
  driverSelect: document.getElementById('driverSelect'),
  dispatchRestaurantIds: document.getElementById('dispatchRestaurantIds'),
  dispatchMerchantIds: document.getElementById('dispatchMerchantIds'),
  statTenants: document.getElementById('statTenants'),
  statMerchants: document.getElementById('statMerchants'),
  statRestaurants: document.getElementById('statRestaurants'),
  statOnlineDrivers: document.getElementById('statOnlineDrivers'),
  statAdmins: document.getElementById('statAdmins'),
  selectedRestaurantSummary: document.getElementById('selectedRestaurantSummary'),
  selectedDriverSummary: document.getElementById('selectedDriverSummary'),
  trackingStoreHint: document.getElementById('trackingStoreHint'),
  architectureSummary: document.getElementById('architectureSummary'),
  merchantUserStatus: document.getElementById('merchantUserStatus'),
  staffStatus: document.getElementById('staffStatus'),
  restaurantPricingStatus: document.getElementById('restaurantPricingStatus'),
  displaySettingsStatus: document.getElementById('displaySettingsStatus'),
  restaurantTrackingStatus: document.getElementById('restaurantTrackingStatus'),
  driverControlsStatus: document.getElementById('driverControlsStatus'),
  tenantStatus: document.getElementById('tenantStatus'),
  tenantAdminStatus: document.getElementById('tenantAdminStatus'),
  createMerchantStatus: document.getElementById('createMerchantStatus'),
  createDriverStatus: document.getElementById('createDriverStatus'),
  createRestaurantStatus: document.getElementById('createRestaurantStatus'),
  reportPreset: document.getElementById('reportPreset'),
  reportTypeSelect: document.getElementById('reportTypeSelect'),
  reportScopeSelect: document.getElementById('reportScopeSelect'),
  reportStartDate: document.getElementById('reportStartDate'),
  reportEndDate: document.getElementById('reportEndDate'),
  reportRangeNote: document.getElementById('reportRangeNote'),
  reportTotalOrders: document.getElementById('reportTotalOrders'),
  reportDeliveredOrders: document.getElementById('reportDeliveredOrders'),
  reportTotalStoreCharges: document.getElementById('reportTotalStoreCharges'),
  reportTotalDriverPay: document.getElementById('reportTotalDriverPay'),
  reportByDriver: document.getElementById('reportByDriver'),
  reportByStore: document.getElementById('reportByStore'),
  reportByMerchantGroup: document.getElementById('reportByMerchantGroup'),
  reportByDay: document.getElementById('reportByDay'),
  reportByTenant: document.getElementById('reportByTenant'),
  reportStatusMix: document.getElementById('reportStatusMix'),
};

const statusNodes = [
  nodes.merchantUserStatus,
  nodes.staffStatus,
  nodes.restaurantPricingStatus,
  nodes.displaySettingsStatus,
  nodes.restaurantTrackingStatus,
  nodes.driverControlsStatus,
  nodes.tenantStatus,
  nodes.tenantAdminStatus,
  nodes.createMerchantStatus,
  nodes.createDriverStatus,
  nodes.createRestaurantStatus,
];

function isPlatformAdmin() {
  return sessionInfo ? PLATFORM_ROLES.has(sessionInfo.role) : false;
}

function activeTenantId() {
  if (!sessionInfo) return '';
  return isPlatformAdmin() ? selectedTenantId : (sessionInfo.tenantId || '');
}

function visibleTenants() {
  if (!sessionInfo) return [];
  return isPlatformAdmin() ? tenants : tenants.filter((tenant) => tenant.id === sessionInfo.tenantId);
}

function visibleMerchants() {
  const tenantId = activeTenantId();
  return merchants.filter((merchant) => !tenantId || merchant.tenantId === tenantId);
}

function visibleRestaurants() {
  const tenantId = activeTenantId();
  return restaurants.filter((restaurant) => !tenantId || restaurant.tenantId === tenantId);
}

function visibleDrivers() {
  const tenantId = activeTenantId();
  return drivers.filter((driver) => !tenantId || driver.tenantId === tenantId);
}

function visibleAdmins() {
  const tenantId = activeTenantId();
  if (!sessionInfo) return [];
  if (!isPlatformAdmin()) return adminUsers.filter((admin) => admin.tenantId === tenantId);
  if (!tenantId) return adminUsers;
  return adminUsers.filter((admin) => admin.tenantId === tenantId || admin.tenantId == null);
}

function tenantName(tenantId) {
  return tenants.find((tenant) => tenant.id === tenantId)?.name || tenantId || 'Platform';
}

function currentRestaurant() {
  const list = visibleRestaurants();
  return list.find((item) => item.id === nodes.settingsRestaurantSelect.value) || list[0] || null;
}

function currentDriver() {
  const list = visibleDrivers();
  return list.find((item) => item.id === nodes.driverSelect.value) || list[0] || null;
}

function clearStatuses() {
  for (const node of statusNodes) {
    node.textContent = '';
    node.style.color = '';
  }
}

function getActiveReportRange() {
  const preset = reportFilterState.preset;
  if (preset === 'all') return {};
  if (preset === 'today') { const today = todayIso(); return { startDate: today, endDate: today }; }
  if (preset === 'last7') return { startDate: dateOffsetIso(-6), endDate: todayIso() };
  if (preset === 'last30') return { startDate: dateOffsetIso(-29), endDate: todayIso() };
  if (preset === 'thisMonth') return { startDate: monthStartIso(), endDate: todayIso() };
  return { startDate: reportFilterState.startDate || undefined, endDate: reportFilterState.endDate || undefined };
}

function adminReportQueryString() {
  const params = new URLSearchParams();
  const range = getActiveReportRange();
  if (range.startDate) params.set('startDate', range.startDate);
  if (range.endDate) params.set('endDate', range.endDate);
  const scope = nodes.reportScopeSelect?.value || 'workspace';
  if (!isPlatformAdmin() || scope !== 'all') {
    const tenantId = activeTenantId();
    if (tenantId) params.set('tenantId', tenantId);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function updateReportFiltersUi() {
  if (!nodes.reportPreset) return;
  nodes.reportPreset.value = reportFilterState.preset;
  const custom = reportFilterState.preset === 'custom';
  nodes.reportStartDate.disabled = !custom;
  nodes.reportEndDate.disabled = !custom;
  const range = getActiveReportRange();
  if (!custom) {
    nodes.reportStartDate.value = range.startDate || '';
    nodes.reportEndDate.value = range.endDate || '';
  } else {
    nodes.reportStartDate.value = reportFilterState.startDate || '';
    nodes.reportEndDate.value = reportFilterState.endDate || '';
  }
  nodes.reportRangeNote.textContent = describeDateRange(range);
}

function renderReportCards(target, items, render) {
  if (!target) return;
  target.innerHTML = items.length ? items.map(render).join('') : '<div class="muted">No data for the selected period.</div>';
}

function clearReportUi() {
  latestAdminReport = null;
  if (!nodes.reportTotalOrders) return;
  nodes.reportTotalOrders.textContent = '0';
  nodes.reportDeliveredOrders.textContent = '0';
  nodes.reportTotalStoreCharges.textContent = '--';
  nodes.reportTotalDriverPay.textContent = '--';
  renderReportCards(nodes.reportByDriver, [], () => '');
  renderReportCards(nodes.reportByStore, [], () => '');
  renderReportCards(nodes.reportByMerchantGroup, [], () => '');
  renderReportCards(nodes.reportByDay, [], () => '');
  renderReportCards(nodes.reportByTenant, [], () => '');
  renderReportCards(nodes.reportStatusMix, [], () => '');
}

function renderAdminReports(report) {
  latestAdminReport = report;
  nodes.reportTotalOrders.textContent = String(report.totalOrders || 0);
  nodes.reportDeliveredOrders.textContent = String(report.deliveredOrders || 0);
  nodes.reportTotalStoreCharges.textContent = formatMoney(report.totalStoreCharges || 0, 'AED');
  nodes.reportTotalDriverPay.textContent = formatMoney(report.totalDriverPay || 0, 'AED');
  renderReportCards(nodes.reportByDriver, report.byDriver || [], (item) => `<article class="card"><strong>${item.driverName}</strong><div class="muted">${item.totalOrders} orders | ${item.deliveredOrders} delivered | ${item.activeOrders} active</div><div class="muted">Driver pay: ${formatMoney(item.totalDriverPay, 'AED')}</div><div class="muted">Store charges: ${formatMoney(item.totalStoreCharges, 'AED')}</div></article>`);
  renderReportCards(nodes.reportByStore, report.byStore || [], (item) => `<article class="card"><strong>${item.restaurantName}</strong><div class="muted">${item.totalOrders} orders | ${item.deliveredOrders} delivered</div><div class="muted">Store charges: ${formatMoney(item.totalStoreCharges, 'AED')}</div><div class="muted">Driver pay: ${formatMoney(item.totalDriverPay, 'AED')}</div></article>`);
  renderReportCards(nodes.reportByMerchantGroup, report.byMerchantGroup || [], (item) => `<article class="card"><strong>${item.merchantName}</strong><div class="muted">${item.totalOrders} orders | ${item.deliveredOrders} delivered</div><div class="muted">Store charges: ${formatMoney(item.totalStoreCharges, 'AED')}</div><div class="muted">Driver pay: ${formatMoney(item.totalDriverPay, 'AED')}</div></article>`);
  renderReportCards(nodes.reportByDay, report.byDay || [], (item) => `<article class="card"><strong>${item.date}</strong><div class="muted">${item.totalOrders} orders | ${item.deliveredOrders} delivered</div><div class="muted">Store charges: ${formatMoney(item.totalStoreCharges, 'AED')}</div></article>`);
  renderReportCards(nodes.reportByTenant, report.byTenant || [], (item) => `<article class="card"><strong>${item.tenantName}</strong><div class="muted">${item.totalOrders} orders | ${item.deliveredOrders} delivered</div><div class="muted">Store charges: ${formatMoney(item.totalStoreCharges, 'AED')}</div><div class="muted">Driver pay: ${formatMoney(item.totalDriverPay, 'AED')}</div></article>`);
  renderReportCards(nodes.reportStatusMix, report.statusMix || [], (item) => `<article class="card"><strong>${item.status}</strong><div class="muted">${item.count} orders</div></article>`);
}


function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.style.color = isError ? '#9b1c1c' : '';
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
  const currencyCode = normalizeCurrencyCode(document.getElementById('currencyCode').value || restaurant?.currency || 'AED');
  const distanceUnit = document.getElementById('distanceUnit').value || restaurant?.distanceUnit || 'kilometer';
  updatePricingFieldLabels(distanceUnit);
  document.getElementById('driverPayoutSummary').textContent = summarizePricingRule(readRuleInputs('driverPayout', distanceUnit), currencyCode, distanceUnit);
  document.getElementById('merchantBillingSummary').textContent = summarizePricingRule(readRuleInputs('merchantBilling', distanceUnit), currencyCode, distanceUnit);
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

function setSessionUi() {
  nodes.authGate.classList.toggle('hidden', hasSession);
  nodes.mainLayout.classList.toggle('hidden', !hasSession);
  nodes.loginControls.classList.toggle('hidden', hasSession);
  nodes.activeSessionCard.classList.toggle('hidden', !hasSession);
  if (!hasSession || !sessionInfo) {
    nodes.activeSessionMeta.innerHTML = '';
    nodes.gateStatus.textContent = 'Not logged in';
    return;
  }
  const scopeLabel = isPlatformAdmin() ? 'Platform admin' : `${sessionInfo.role} for ${tenantName(sessionInfo.tenantId)}`;
  nodes.activeSessionMeta.innerHTML = `<strong>${sessionInfo.name}</strong><div class="muted">${scopeLabel}</div>`;
  nodes.gateStatus.textContent = `Logged in as ${sessionInfo.name}`;
}

function clearWorkspace() {
  tenants = [];
  merchants = [];
  restaurants = [];
  drivers = [];
  adminUsers = [];
  nodes.statTenants.textContent = '0';
  nodes.statMerchants.textContent = '0';
  nodes.statRestaurants.textContent = '0';
  nodes.statOnlineDrivers.textContent = '0';
  nodes.statAdmins.textContent = '0';
  nodes.tenantContextSelect.innerHTML = '';
  nodes.tenantAdminTenantSelect.innerHTML = '';
  nodes.createMerchantTenantSelect.innerHTML = '';
  nodes.createDriverTenantSelect.innerHTML = '';
  nodes.createRestaurantTenantSelect.innerHTML = '';
  nodes.createRestaurantMerchantSelect.innerHTML = '';
  nodes.merchantSelect.innerHTML = '';
  nodes.restaurantSelect.innerHTML = '';
  nodes.settingsRestaurantSelect.innerHTML = '';
  nodes.driverSelect.innerHTML = '';
  nodes.dispatchRestaurantIds.innerHTML = '';
  nodes.dispatchMerchantIds.innerHTML = '';
  nodes.selectedRestaurantSummary.textContent = 'Choose a store in the current workspace.';
  nodes.selectedDriverSummary.textContent = 'Choose a driver in the current workspace.';
  nodes.tenantContextSummary.textContent = 'Sign in to load tenant context.';
  nodes.architectureSummary.textContent = '';
  clearReportUi();
  document.getElementById('tenants').innerHTML = '<div class="muted">Sign in to load tenant data.</div>';
  document.getElementById('admins').innerHTML = '<div class="muted">Sign in to load admin data.</div>';
  document.getElementById('merchants').innerHTML = '<div class="muted">Sign in to load merchant groups.</div>';
  document.getElementById('restaurants').innerHTML = '<div class="muted">Sign in to load stores.</div>';
  document.getElementById('drivers').innerHTML = '<div class="muted">Sign in to load drivers.</div>';
}

function getLoginCredentials() {
  return resolveLoginCredentials(nodes);
}

function renderCollection(nodeId, items, renderItem) {
  const node = document.getElementById(nodeId);
  node.innerHTML = items.map(renderItem).join('') || '<div class="muted">No records in this workspace.</div>';
}

function updateTenantControlsVisibility() {
  const allowPlatformSections = portalSurface === 'platform' && isPlatformAdmin();
  document.querySelectorAll('[data-platform-only]').forEach((node) => node.classList.toggle('hidden', !allowPlatformSections));
  document.querySelectorAll('.tenant-select-wrap').forEach((node) => node.classList.toggle('hidden', !allowPlatformSections));
}

function applySurfaceBranding() {
  const heroEyebrow = document.querySelector('.hero .eyebrow');
  const heroTitle = document.querySelector('.hero h1');
  const heroCopy = document.querySelector('.hero p');
  const heroBadge = document.querySelector('.hero-badge');
  if (portalSurface === 'tenant') {
    document.title = 'Tenant Admin Portal';
    if (heroEyebrow) heroEyebrow.textContent = 'Tenant operations';
    if (heroTitle) heroTitle.textContent = 'Tenant Admin Workspace';
    if (heroCopy) heroCopy.textContent = 'Use this workspace to operate one client tenant only. Tenant admins manage drivers, merchant groups, stores, staffing, pricing, and dispatch rules inside their assigned business.';
    if (heroBadge) heroBadge.innerHTML = 'Current surface<strong>Tenant-scoped admin</strong>';
  } else {
    document.title = 'Platform Admin Portal';
    if (heroEyebrow) heroEyebrow.textContent = 'Platform operations';
    if (heroTitle) heroTitle.textContent = 'Tenant Control Center';
    if (heroCopy) heroCopy.textContent = 'Use this workspace to operate your fleet platform cleanly across multiple client tenants. Platform admins provision tenants and support them. Tenant admins manage only their own drivers, merchant groups, stores, staffing, pricing, and dispatch rules.';
    if (heroBadge) heroBadge.innerHTML = 'Current surface<strong>Platform-wide admin</strong>';
  }
}

function populateTenantSelect(selectNode) {
  selectNode.innerHTML = visibleTenants().map((tenant) => `<option value="${tenant.id}">${tenant.name}</option>`).join('');
}

function syncTenantContext() {
  populateTenantSelect(nodes.tenantContextSelect);
  if (!sessionInfo) {
    nodes.tenantContextSummary.textContent = 'Sign in to load tenant context.';
    return;
  }
  if (isPlatformAdmin()) {
    if (!selectedTenantId && visibleTenants().length) {
      selectedTenantId = visibleTenants()[0].id;
    }
    nodes.tenantContextSelect.disabled = false;
    nodes.tenantContextSelect.value = selectedTenantId || '';
    nodes.tenantContextSummary.innerHTML = `<strong>Platform admin mode</strong><div>Active workspace: ${tenantName(selectedTenantId)}</div><div>You can switch tenants here without changing sessions.</div>`;
  } else {
    selectedTenantId = sessionInfo.tenantId || '';
    nodes.tenantContextSelect.disabled = true;
    nodes.tenantContextSelect.value = selectedTenantId || '';
    nodes.tenantContextSummary.innerHTML = `<strong>Tenant admin mode</strong><div>Locked to: ${tenantName(selectedTenantId)}</div><div>All lists and actions are automatically scoped to this tenant.</div>`;
  }
}

function syncCreationTenantSelectors() {
  [nodes.tenantAdminTenantSelect, nodes.createMerchantTenantSelect, nodes.createDriverTenantSelect, nodes.createRestaurantTenantSelect].forEach(populateTenantSelect);
  const tenantId = activeTenantId();
  if (tenantId) {
    nodes.tenantAdminTenantSelect.value = tenantId;
    nodes.createMerchantTenantSelect.value = tenantId;
    nodes.createDriverTenantSelect.value = tenantId;
    nodes.createRestaurantTenantSelect.value = tenantId;
  }
  nodes.tenantAdminTenantSelect.disabled = !isPlatformAdmin();
  nodes.createMerchantTenantSelect.disabled = !isPlatformAdmin();
  nodes.createDriverTenantSelect.disabled = !isPlatformAdmin();
  nodes.createRestaurantTenantSelect.disabled = !isPlatformAdmin();
}

function syncRestaurantMerchantSelect() {
  const tenantId = isPlatformAdmin() ? nodes.createRestaurantTenantSelect.value : activeTenantId();
  nodes.createRestaurantMerchantSelect.innerHTML = merchants
    .filter((merchant) => !tenantId || merchant.tenantId === tenantId)
    .map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`)
    .join('');
}

function populateEntitySelects() {
  const merchantOptions = visibleMerchants().map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
  const restaurantOptions = visibleRestaurants().map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  const driverOptions = visibleDrivers().map((driver) => `<option value="${driver.id}">${driver.name}</option>`).join('');
  nodes.merchantSelect.innerHTML = merchantOptions;
  nodes.restaurantSelect.innerHTML = restaurantOptions;
  nodes.settingsRestaurantSelect.innerHTML = restaurantOptions;
  nodes.driverSelect.innerHTML = driverOptions;
  nodes.dispatchRestaurantIds.innerHTML = visibleRestaurants().map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
  nodes.dispatchMerchantIds.innerHTML = visibleMerchants().map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`).join('');
  syncRestaurantSettingsForm();
  syncDriverControlsForm();
}

function syncRestaurantSettingsForm() {
  const restaurant = currentRestaurant();
  if (!restaurant) {
    nodes.selectedRestaurantSummary.textContent = 'Choose a store in the current workspace.';
    nodes.trackingStoreHint.textContent = 'Choose a store above. The settings saved here apply only to that one store.';
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
  const merchantName = merchants.find((merchant) => merchant.id === restaurant.merchantId)?.name || restaurant.merchantId;
  nodes.selectedRestaurantSummary.innerHTML = `
    <strong>${restaurant.name}</strong>
    <div>Tenant: ${tenantName(restaurant.tenantId)}</div>
    <div>Merchant group: ${merchantName}</div>
    <div>Market: ${normalizeCurrencyCode(restaurant.currency)} | ${restaurant.distanceUnit === 'mile' ? 'Miles' : 'Kilometers'}</div>
    <div>Driver pay: ${summarizePricingRule(restaurant.pricing.driverPayoutRule, restaurant.currency, restaurant.distanceUnit)}</div>
    <div>Store charge: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div>
  `;
  nodes.trackingStoreHint.textContent = `Tracking display settings below apply only to ${restaurant.name}.`;
  updatePricingSummaries();
}

function syncDriverControlsForm() {
  const driver = currentDriver();
  if (!driver) {
    nodes.selectedDriverSummary.textContent = 'Choose a driver in the current workspace.';
    return;
  }
  nodes.driverSelect.value = driver.id;
  document.getElementById('driverCapacity').value = String(driver.maxActiveOrders);
  document.getElementById('dispatchModeSelect').value = driver.dispatchPolicy.mode;
  setSelectedValues(nodes.dispatchRestaurantIds, driver.dispatchPolicy.restaurantIds);
  setSelectedValues(nodes.dispatchMerchantIds, driver.dispatchPolicy.merchantIds);
  const assignedRestaurantNames = visibleRestaurants().filter((restaurant) => driver.dispatchPolicy.restaurantIds.includes(restaurant.id)).map((restaurant) => restaurant.name);
  const assignedMerchantNames = visibleMerchants().filter((merchant) => driver.dispatchPolicy.merchantIds.includes(merchant.id)).map((merchant) => merchant.name);
  nodes.selectedDriverSummary.innerHTML = `
    <strong>${driver.name}</strong>
    <div>Tenant: ${tenantName(driver.tenantId)}</div>
    <div>${driver.isOnline ? 'Online' : 'Offline'} | Load ${driver.currentLoad}/${driver.maxActiveOrders}</div>
    <div>Dispatch mode: ${driver.dispatchPolicy.mode}</div>
    <div>Allowed stores: ${assignedRestaurantNames.join(', ') || 'None selected'}</div>
    <div>Allowed merchant groups: ${assignedMerchantNames.join(', ') || 'None selected'}</div>
    <div>Location freshness: ${driver.locationFreshness}</div>
  `;
}

function renderDashboard() {
  const tenantRows = visibleTenants();
  const merchantRows = visibleMerchants();
  const restaurantRows = visibleRestaurants();
  const driverRows = visibleDrivers();
  const adminRows = visibleAdmins();

  nodes.statTenants.textContent = String(tenantRows.length);
  nodes.statMerchants.textContent = String(merchantRows.length);
  nodes.statRestaurants.textContent = String(restaurantRows.length);
  nodes.statOnlineDrivers.textContent = String(driverRows.filter((driver) => driver.isOnline).length);
  nodes.statAdmins.textContent = String(adminRows.length);

  renderCollection('tenants', tenantRows, (tenant) => `<article class="card"><div><strong>${tenant.name}</strong></div><div class="muted mono">${tenant.slug}</div><div class="muted">${tenant.isActive ? 'Active' : 'Inactive'} tenant</div></article>`);
  renderCollection('admins', adminRows, (admin) => `<article class="card"><div><strong>${admin.name}</strong></div><div class="muted">${admin.email}</div><div class="muted">${admin.role} | ${admin.isActive ? 'Active' : 'Inactive'}</div><div class="muted">Workspace: ${admin.tenantId ? tenantName(admin.tenantId) : 'Platform-wide'}</div></article>`);
  renderCollection('merchants', merchantRows, (merchant) => `<article class="card"><div><strong>${merchant.name}</strong></div><div class="muted">Tenant: ${tenantName(merchant.tenantId)}</div><div class="muted">${merchant.users.length} merchant users</div><div class="muted">${merchant.users.map((user) => `${user.name} (${user.role})`).join(', ') || 'No merchant users'}</div></article>`);
  renderCollection('restaurants', restaurantRows, (restaurant) => {
    const merchantName = merchants.find((merchant) => merchant.id === restaurant.merchantId)?.name || restaurant.merchantId;
    return `<article class="card"><div class="eyebrow">${tenantName(restaurant.tenantId)}</div><h4 style="margin:4px 0">${restaurant.name}</h4><div class="muted">Merchant group: ${merchantName}</div><div class="muted">Market: ${normalizeCurrencyCode(restaurant.currency)} | ${restaurant.distanceUnit === 'mile' ? 'Miles' : 'Kilometers'}</div><div class="muted">Driver pay: ${summarizePricingRule(restaurant.pricing.driverPayoutRule, restaurant.currency, restaurant.distanceUnit)}</div><div class="muted">Store charge: ${summarizePricingRule(restaurant.pricing.merchantBillingRule, restaurant.currency, restaurant.distanceUnit)}</div><div class="muted">Driver app offer: ${restaurant.driverOfferSettings?.distanceMode === 'includeCommuteToStore' ? 'Commute + delivery' : 'Store to customer only'}</div></article>`;
  });
  renderCollection('drivers', driverRows, (driver) => {
    const assignedRestaurantNames = restaurantRows.filter((restaurant) => driver.dispatchPolicy.restaurantIds.includes(restaurant.id)).map((restaurant) => restaurant.name).join(', ') || 'None selected';
    const assignedMerchantNames = merchantRows.filter((merchant) => driver.dispatchPolicy.merchantIds.includes(merchant.id)).map((merchant) => merchant.name).join(', ') || 'None selected';
    return `<article class="card"><div><strong>${driver.name}</strong></div><div class="muted">${driver.email}</div><div class="muted">${driver.isOnline ? 'Online' : 'Offline'} | Capacity ${driver.maxActiveOrders} | Load ${driver.currentLoad}</div><div class="muted">Dispatch mode: ${driver.dispatchPolicy.mode}</div><div class="muted">Stores: ${assignedRestaurantNames}</div><div class="muted">Merchant groups: ${assignedMerchantNames}</div></article>`;
  });

  nodes.architectureSummary.innerHTML = `<div><strong>Platform admin</strong>: can provision tenants and support all workspaces.</div><div><strong>Tenant admin</strong>: can create and operate only drivers, merchant groups, stores, and staff inside ${tenantName(activeTenantId()) || 'the assigned tenant'}.</div><div><strong>Merchant group</strong>: remains a business grouping inside one tenant, not the tenant itself.</div>`;
}

function ensureSurfaceMatchesRole() {
  if (!sessionInfo) return false;
  if (portalSurface === 'platform' && !isPlatformAdmin()) {
    window.location.replace('/tenant-admin');
    return true;
  }
  if (portalSurface === 'tenant' && isPlatformAdmin()) {
    window.location.replace('/platform-admin');
    return true;
  }
  return false;
}

function syncSessionSummary() {
  if (!sessionInfo) {
    nodes.sessionStatus.textContent = 'Not logged in';
    nodes.heroModeLabel.textContent = 'Signed out';
    nodes.workspaceModePill.textContent = 'Awaiting session';
    setSessionUi();
    return;
  }
  const scopeLabel = isPlatformAdmin() ? 'Platform admin' : `${sessionInfo.role} for ${tenantName(sessionInfo.tenantId)}`;
  nodes.sessionStatus.textContent = `Logged in as ${sessionInfo.name} (${scopeLabel})`;
  nodes.heroModeLabel.textContent = scopeLabel;
  nodes.workspaceModePill.textContent = isPlatformAdmin() ? `Platform view | ${tenantName(activeTenantId())}` : `Tenant view | ${tenantName(activeTenantId())}`;
  setSessionUi();
}

async function refreshDashboard() {
  try {
    const [session, tenantRows, merchantRows, restaurantRows, driverRows, adminRows] = await Promise.all([
      request('/api/auth/admin/session', {}, false),
      request('/api/admin/tenants', {}, false),
      request('/api/admin/merchants', {}, false),
      request('/api/admin/restaurants', {}, false),
      request('/api/admin/drivers', {}, false),
      request('/api/admin/admin-users', {}, false),
    ]);
    hasSession = true;
    sessionInfo = session;
    tenants = tenantRows;
    merchants = merchantRows;
    restaurants = restaurantRows;
    drivers = driverRows;
    adminUsers = adminRows;
    if (!selectedTenantId || (isPlatformAdmin() && !tenants.some((tenant) => tenant.id === selectedTenantId))) {
      selectedTenantId = isPlatformAdmin() ? (tenants[0]?.id || '') : (sessionInfo.tenantId || '');
    }
    if (ensureSurfaceMatchesRole()) {
      return;
    }
    clearStatuses();
    updateTenantControlsVisibility();
    syncTenantContext();
    syncCreationTenantSelectors();
    syncRestaurantMerchantSelect();
    populateEntitySelects();
    syncSessionSummary();
    renderDashboard();
    updateReportFiltersUi();
    try {
      const report = await request(`/api/admin/report${adminReportQueryString()}`, {}, false);
      renderAdminReports(report);
    } catch (error) {
      clearReportUi();
      if (nodes.reportRangeNote) {
        nodes.reportRangeNote.textContent = error.message;
      }
    }
  } catch (error) {
    hasSession = false;
    sessionInfo = null;
    selectedTenantId = '';
    clearWorkspace();
    syncSessionSummary();
    throw error;
  }
}

async function login() {
  await request('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify(getLoginCredentials()),
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
    sessionInfo = null;
    selectedTenantId = '';
    clearWorkspace();
    syncSessionSummary();
  }
}

function createTenantScope(selectNode) {
  return isPlatformAdmin() ? selectNode.value : activeTenantId();
}

async function createTenant() {
  const tenant = await request('/api/admin/tenants', {
    method: 'POST',
    body: JSON.stringify({ name: document.getElementById('tenantName').value.trim(), slug: document.getElementById('tenantSlug').value.trim() }),
  });
  selectedTenantId = tenant.id;
  setStatus(nodes.tenantStatus, `Tenant created: ${tenant.name}`);
  await refreshDashboard();
}

async function createTenantAdmin() {
  const tenantId = createTenantScope(nodes.tenantAdminTenantSelect);
  await request(`/api/admin/tenants/${tenantId}/admin-users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('tenantAdminName').value.trim(),
      email: document.getElementById('tenantAdminEmail').value.trim(),
      password: document.getElementById('tenantAdminPassword').value,
      role: document.getElementById('tenantAdminRole').value,
    }),
  });
  setStatus(nodes.tenantAdminStatus, 'Tenant admin created.');
  await refreshDashboard();
}

async function createMerchant() {
  await request('/api/admin/merchants', {
    method: 'POST',
    body: JSON.stringify({ tenantId: createTenantScope(nodes.createMerchantTenantSelect), name: document.getElementById('merchantName').value.trim() }),
  });
  setStatus(nodes.createMerchantStatus, 'Merchant group created.');
  await refreshDashboard();
}

async function createDriver() {
  await request('/api/admin/drivers', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: createTenantScope(nodes.createDriverTenantSelect),
      name: document.getElementById('driverName').value.trim(),
      email: document.getElementById('driverEmail').value.trim(),
      password: document.getElementById('driverPassword').value,
    }),
  });
  setStatus(nodes.createDriverStatus, 'Driver created.');
  await refreshDashboard();
}

async function createRestaurant() {
  await request('/api/admin/restaurants', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: createTenantScope(nodes.createRestaurantTenantSelect),
      merchantId: nodes.createRestaurantMerchantSelect.value,
      name: document.getElementById('restaurantName').value.trim(),
      email: document.getElementById('restaurantEmail').value.trim(),
      password: document.getElementById('restaurantPassword').value,
      pickupLocation: {
        name: document.getElementById('restaurantLocationName').value.trim(),
        address: document.getElementById('restaurantLocationAddress').value.trim(),
        latitude: Number(document.getElementById('restaurantLatitude').value),
        longitude: Number(document.getElementById('restaurantLongitude').value),
      },
      currency: normalizeCurrencyCode(document.getElementById('restaurantCurrency').value),
      distanceUnit: document.getElementById('restaurantDistanceUnit').value,
    }),
  });
  setStatus(nodes.createRestaurantStatus, 'Store created.');
  await refreshDashboard();
}

async function createMerchantUser() {
  await request(`/api/admin/merchants/${nodes.merchantSelect.value}/users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('merchantUserName').value.trim(),
      email: document.getElementById('merchantUserEmail').value.trim(),
      password: document.getElementById('merchantUserPassword').value,
      role: document.getElementById('merchantUserRole').value,
    }),
  });
  setStatus(nodes.merchantUserStatus, 'Merchant user created.');
  await refreshDashboard();
}

async function createStaffUser() {
  await request(`/api/admin/restaurants/${nodes.restaurantSelect.value}/staff-users`, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('staffName').value.trim(),
      email: document.getElementById('staffEmail').value.trim(),
      password: document.getElementById('staffPassword').value,
      role: document.getElementById('staffRole').value,
    }),
  });
  setStatus(nodes.staffStatus, 'Store staff account created.');
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
  setStatus(nodes.restaurantPricingStatus, 'Store commercial terms updated.');
  await refreshDashboard();
}

async function saveDisplaySettings() {
  const restaurant = currentRestaurant();
  if (!restaurant) return;
  await request(`/api/admin/restaurants/${restaurant.id}/display-settings`, {
    method: 'PATCH',
    body: JSON.stringify({ currency: normalizeCurrencyCode(document.getElementById('currencyCode').value), distanceUnit: document.getElementById('distanceUnit').value }),
  });
  setStatus(nodes.displaySettingsStatus, 'Store market settings updated.');
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
  setStatus(nodes.restaurantTrackingStatus, 'Store tracking and driver-offer display updated.');
  await refreshDashboard();
}

async function saveDriverSettings() {
  const driver = currentDriver();
  if (!driver) return;
  await request(`/api/admin/drivers/${driver.id}/capacity`, { method: 'PATCH', body: JSON.stringify({ maxActiveOrders: Number(document.getElementById('driverCapacity').value) }) });
  await request(`/api/admin/drivers/${driver.id}/dispatch-policy`, {
    method: 'PATCH',
    body: JSON.stringify({
      mode: document.getElementById('dispatchModeSelect').value,
      restaurantIds: getSelectedValues(nodes.dispatchRestaurantIds),
      merchantIds: getSelectedValues(nodes.dispatchMerchantIds),
    }),
  });
  setStatus(nodes.driverControlsStatus, 'Driver settings updated.');
  await refreshDashboard();
}

function runAction(fn, statusNode) {
  return () => fn().catch((error) => setStatus(statusNode, error.message, true));
}

async function applyReportFilters() {
  reportFilterState = { preset: nodes.reportPreset.value, startDate: nodes.reportStartDate.value, endDate: nodes.reportEndDate.value };
  updateReportFiltersUi();
  const report = await request(`/api/admin/report${adminReportQueryString()}`);
  renderAdminReports(report);
}

async function resetReportFilters() {
  reportFilterState = { preset: 'last30', startDate: '', endDate: '' };
  updateReportFiltersUi();
  const report = await request(`/api/admin/report${adminReportQueryString()}`);
  renderAdminReports(report);
}

function exportReport() {
  const type = nodes.reportTypeSelect?.value || 'orders';
  window.location.href = `/api/admin/report-export.csv${adminReportQueryString()}${adminReportQueryString() ? '&' : '?'}reportType=${encodeURIComponent(type)}`;
}


document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('gateLoginBtn').addEventListener('click', () => login().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => { nodes.sessionStatus.textContent = error.message; nodes.gateStatus.textContent = error.message; }));
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => { if (hasSession) alert(error.message); }));
document.getElementById('createTenantBtn').addEventListener('click', runAction(createTenant, nodes.tenantStatus));
document.getElementById('createTenantAdminBtn').addEventListener('click', runAction(createTenantAdmin, nodes.tenantAdminStatus));
document.getElementById('createMerchantBtn').addEventListener('click', runAction(createMerchant, nodes.createMerchantStatus));
document.getElementById('createDriverBtn').addEventListener('click', runAction(createDriver, nodes.createDriverStatus));
document.getElementById('createRestaurantBtn').addEventListener('click', runAction(createRestaurant, nodes.createRestaurantStatus));
document.getElementById('createMerchantUserBtn').addEventListener('click', runAction(createMerchantUser, nodes.merchantUserStatus));
document.getElementById('createStaffBtn').addEventListener('click', runAction(createStaffUser, nodes.staffStatus));
document.getElementById('saveRestaurantPricingBtn').addEventListener('click', runAction(saveRestaurantPricing, nodes.restaurantPricingStatus));
document.getElementById('saveDisplaySettingsBtn').addEventListener('click', runAction(saveDisplaySettings, nodes.displaySettingsStatus));
document.getElementById('saveTrackingBtn').addEventListener('click', runAction(saveTrackingSettings, nodes.restaurantTrackingStatus));
document.getElementById('saveDriverSettingsBtn').addEventListener('click', runAction(saveDriverSettings, nodes.driverControlsStatus));
nodes.tenantContextSelect.addEventListener('change', () => {
  if (!isPlatformAdmin()) return;
  selectedTenantId = nodes.tenantContextSelect.value;
  syncCreationTenantSelectors();
  syncRestaurantMerchantSelect();
  populateEntitySelects();
  syncSessionSummary();
  renderDashboard();
  request(`/api/admin/report${adminReportQueryString()}`).then(renderAdminReports).catch(() => clearReportUi());
});
nodes.createRestaurantTenantSelect.addEventListener('change', syncRestaurantMerchantSelect);
nodes.settingsRestaurantSelect.addEventListener('change', syncRestaurantSettingsForm);
nodes.driverSelect.addEventListener('change', syncDriverControlsForm);
document.getElementById('currencyCode').addEventListener('input', updatePricingSummaries);
document.getElementById('applyReportFiltersBtn').addEventListener('click', () => applyReportFilters().catch((error) => { nodes.reportRangeNote.textContent = error.message; }));
document.getElementById('resetReportFiltersBtn').addEventListener('click', () => resetReportFilters().catch((error) => { nodes.reportRangeNote.textContent = error.message; }));
document.getElementById('exportReportBtn').addEventListener('click', exportReport);
if (nodes.reportScopeSelect) {
  nodes.reportScopeSelect.addEventListener('change', () => {
    request(`/api/admin/report${adminReportQueryString()}`).then(renderAdminReports).catch(() => clearReportUi());
  });
}
nodes.reportPreset.addEventListener('change', () => {
  reportFilterState.preset = nodes.reportPreset.value;
  if (reportFilterState.preset !== 'custom') {
    reportFilterState.startDate = '';
    reportFilterState.endDate = '';
  }
  updateReportFiltersUi();
});
document.getElementById('distanceUnit').addEventListener('change', () => {
  nodes.displaySettingsStatus.textContent = 'Save store market settings to apply the new distance unit to pricing fields and driver-facing displays.';
});
['driverPayoutBaseAmount','driverPayoutIncludedDistanceKm','driverPayoutAdditionalPerKm','merchantBillingBaseAmount','merchantBillingIncludedDistanceKm','merchantBillingAdditionalPerKm'].forEach((id) => document.getElementById(id).addEventListener('input', updatePricingSummaries));

applySurfaceBranding();
clearWorkspace();
updateReportFiltersUi();
setSessionUi();
refreshDashboard().catch(() => {});
setInterval(() => { if (hasSession) refreshSession().catch(() => {}); }, 10 * 60 * 1000);
