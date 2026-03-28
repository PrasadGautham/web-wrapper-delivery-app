const apiBase = '';
let token = localStorage.getItem('merchantToken') || '';
let stream = null;
let refreshingToken = null;
let restaurants = [];

const nodes = {
  connectionDot: document.getElementById('connectionDot'),
  connectionText: document.getElementById('connectionText'),
  sessionStatus: document.getElementById('sessionStatus'),
  restaurantSelect: document.getElementById('restaurantSelect'),
  staffStatus: document.getElementById('staffStatus'),
  staffList: document.getElementById('staffList'),
  restaurants: document.getElementById('restaurants'),
  orders: document.getElementById('orders'),
  statStores: document.getElementById('statStores'),
  statOrders: document.getElementById('statOrders'),
  statPayout: document.getElementById('statPayout'),
  statCharges: document.getElementById('statCharges'),
};

function currency(value) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

function clearSessionState(message = 'Merchant session expired. Please log in again.') {
  token = '';
  localStorage.removeItem('merchantToken');
  stopStream();
  restaurants = [];
  nodes.sessionStatus.textContent = message;
  nodes.staffStatus.textContent = 'Select a store to list and create staff users.';
  refreshDashboard().catch((error) => console.error(error));
}

function setConnectionState(text, live) {
  nodes.connectionText.textContent = text;
  nodes.connectionDot.classList.toggle('live', Boolean(live));
}

async function request(path, options = {}, attemptRefresh = true) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !Object.prototype.hasOwnProperty.call(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (response.status === 401 && token && attemptRefresh && !path.includes('/api/auth/merchant/refresh')) {
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
  if (!token) {
    throw new Error('No active session');
  }
  if (!refreshingToken) {
    refreshingToken = request('/api/auth/merchant/refresh', { method: 'POST' }, false)
      .then((result) => {
        token = result.token;
        localStorage.setItem('merchantToken', token);
        return token;
      })
      .catch((error) => {
        clearSessionState();
        throw error;
      })
      .finally(() => {
        refreshingToken = null;
      });
  }
  return refreshingToken;
}

function populateRestaurantSelect() {
  nodes.restaurantSelect.innerHTML = restaurants.map((restaurant) => `<option value="${restaurant.id}">${restaurant.name}</option>`).join('');
}

function renderRestaurantCards(groups, report) {
  nodes.statStores.textContent = report.totalRestaurants;
  nodes.statOrders.textContent = report.totalOrders;
  nodes.statPayout.textContent = currency(report.totalDriverPayout);
  nodes.statCharges.textContent = currency(report.totalRestaurantCharges);
  nodes.restaurants.innerHTML = groups.map((group) => `
    <article class="card">
      <div class="section-head"><strong>${group.restaurant.name}</strong><span class="pill">${group.orders.length} orders</span></div>
      <div class="muted">${group.restaurant.pickupLocation.address}</div>
      <div class="muted">Driver rate ${currency(group.restaurant.driverRatePerOrder)} | Store charge ${currency(group.restaurant.restaurantChargePerOrder)}</div>
    </article>
  `).join('') || '<div class="muted">No stores assigned.</div>';
}

function renderOrders(groups) {
  const rows = groups.flatMap((group) => group.orders.map((order) => ({ order, restaurant: group.restaurant })));
  nodes.orders.innerHTML = rows.map(({ order, restaurant }) => `
    <article class="card">
      <div class="section-head"><strong>${restaurant.name}</strong><span class="pill">${order.tracking.displayStatus}</span></div>
      <div>${order.customer.name}</div>
      <div class="muted">${order.customer.address}</div>
      <div class="muted">Driver: ${order.tracking.assignedDriverName || 'Waiting'} | Pickup ETA: ${order.tracking.driverEtaToPickupMinutes ?? 'n/a'} min | Destination ETA: ${order.tracking.destinationEtaMinutes ?? 'n/a'} min</div>
    </article>
  `).join('') || '<div class="muted">No merchant-wide orders yet.</div>';
}

async function refreshStaffList() {
  const restaurantId = nodes.restaurantSelect.value;
  if (!restaurantId || !token) {
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
  if (!token) {
    nodes.sessionStatus.textContent = 'Not logged in';
    nodes.restaurants.innerHTML = '<div class="muted">Login to load merchant stores.</div>';
    nodes.orders.innerHTML = '';
    nodes.staffList.innerHTML = '';
    nodes.statStores.textContent = '0';
    nodes.statOrders.textContent = '0';
    nodes.statPayout.textContent = 'AED 0.00';
    nodes.statCharges.textContent = 'AED 0.00';
    nodes.restaurantSelect.innerHTML = '';
    setConnectionState('Waiting for merchant session.', false);
    return;
  }
  const [profile, report, restaurantList, orderGroups] = await Promise.all([
    request('/api/merchant/me/profile'),
    request('/api/merchant/me/report'),
    request('/api/merchant/me/restaurants'),
    request('/api/merchant/me/orders'),
  ]);
  restaurants = restaurantList;
  nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
  populateRestaurantSelect();
  renderRestaurantCards(orderGroups, report);
  renderOrders(orderGroups);
  await refreshStaffList();
}

function stopStream() {
  if (stream) {
    stream.close();
    stream = null;
  }
}

async function connectStream() {
  stopStream();
  if (!token) {
    return;
  }
  try {
    const { ticket } = await request('/api/auth/merchant/stream-ticket', { method: 'POST' });
    stream = new EventSource(`/api/merchant/me/stream?ticket=${encodeURIComponent(ticket)}`);
  } catch (error) {
    setConnectionState('Realtime link unavailable. Refresh or log in again.', false);
    throw error;
  }
  setConnectionState('Connecting to live merchant updates…', false);
  stream.addEventListener('ready', () => setConnectionState('Live merchant updates connected.', true));
  stream.addEventListener('restaurant-updated', () => {
    refreshDashboard().catch((error) => console.error(error));
  });
  stream.addEventListener('ping', () => setConnectionState('Live merchant updates connected.', true));
  stream.onerror = () => {
    setConnectionState('Realtime link interrupted. Reconnecting…', false);
    stopStream();
    setTimeout(() => connectStream().catch((error) => console.error(error)), 2000);
  };
}

async function login() {
  const result = await request('/api/auth/merchant/login', {
    method: 'POST',
    body: JSON.stringify({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value.trim(),
    }),
  }, false);
  token = result.token;
  localStorage.setItem('merchantToken', token);
  await refreshDashboard();
  await connectStream();
}

async function logout() {
  try {
    if (token) {
      await request('/api/auth/merchant/logout', { method: 'POST' });
    }
  } finally {
    token = '';
    localStorage.removeItem('merchantToken');
    stopStream();
    await refreshDashboard();
  }
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
document.getElementById('refreshBtn').addEventListener('click', () => refreshDashboard().catch((error) => alert(error.message)));
document.getElementById('createStaffBtn').addEventListener('click', () => createStaffUser().catch((error) => { nodes.staffStatus.textContent = error.message; }));
document.getElementById('restaurantSelect').addEventListener('change', () => refreshStaffList().catch((error) => { nodes.staffStatus.textContent = error.message; }));

refreshDashboard().catch((error) => console.error(error));
if (token) {
  connectStream().catch((error) => console.error(error));
}
setInterval(() => {
  if (token) {
    refreshSession().catch(() => {});
  }
}, 10 * 60 * 1000);


