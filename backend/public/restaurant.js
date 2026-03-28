const apiBase = '';
let hasSession = false;
let stream = null;
let refreshingSession = null;

const nodes = {
  sessionStatus: document.getElementById('sessionStatus'),
  connectionText: document.getElementById('connectionText'),
  connectionDot: document.getElementById('connectionDot'),
  trackingSettings: document.getElementById('trackingSettings'),
  storeSummary: document.getElementById('storeSummary'),
  resetStatus: document.getElementById('resetStatus'),
  statTotal: document.getElementById('statTotal'),
  statActive: document.getElementById('statActive'),
  statPayout: document.getElementById('statPayout'),
  statCharges: document.getElementById('statCharges'),
  orders: document.getElementById('orders'),
  resetPanel: document.getElementById('resetPanel'),
};

function currency(value) {
  return `AED ${Number(value || 0).toFixed(2)}`;
}

function setConnectionState(text, live) {
  nodes.connectionText.textContent = text;
  nodes.connectionDot.classList.toggle('live', Boolean(live));
}

function formatStatus(value) {
  if (!value) {
    return 'Unknown';
  }
  if (value === 'inTransit') {
    return 'In transit';
  }
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function formatMinutes(value) {
  if (value == null) {
    return 'Not available';
  }
  return `${value} min`;
}

function formatEtaSource(value) {
  if (!value || value === 'not-available') {
    return 'Not available';
  }
  if (value === 'static-estimate') {
    return 'Static estimate';
  }
  if (value === 'live-driver-location') {
    return 'Live driver location';
  }
  if (value === 'google-routes') {
    return 'Google traffic routing';
  }
  return value;
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
  if (!hasSession) {
    throw new Error('No active session');
  }
  if (!refreshingSession) {
    refreshingSession = request('/api/auth/restaurant/refresh', { method: 'POST' }, false)
      .then(() => {
        hasSession = true;
      })
      .catch((error) => {
        hasSession = false;
        stopStream();
        throw error;
      })
      .finally(() => {
        refreshingSession = null;
      });
  }
  return refreshingSession;
}

function renderTrackingSettings(profile) {
  const settings = profile?.trackingSettings;
  if (!settings) {
    nodes.trackingSettings.textContent = 'No active store session.';
    return;
  }
  nodes.trackingSettings.innerHTML = [
    `Pickup status shown as In transit: <strong>${settings.showPickedUpAsInTransit ? 'On' : 'Off'}</strong>`,
    `Show courier ETA to pickup: <strong>${settings.showDriverEtaToPickup ? 'On' : 'Off'}</strong>`,
    `Show destination ETA after pickup: <strong>${settings.showDestinationEta ? 'On' : 'Off'}</strong>`,
  ].join('<br />');
}

function renderOrders(orders) {
  nodes.orders.innerHTML = '';
  if (!orders.length) {
    nodes.orders.innerHTML = '<div class="muted">No orders yet.</div>';
    return;
  }

  for (const order of orders) {
    const node = document.createElement('article');
    node.className = 'order';
    node.innerHTML = `
      <div class="pill">${formatStatus(order.tracking.displayStatus)}</div>
      <h3>${order.customer.name}</h3>
      <div class="muted">${order.customer.address}</div>
      <div class="order-grid">
        <div class="meta">
          <div><strong>Assigned courier</strong></div>
          <div>${order.tracking.assignedDriverName || 'Waiting for courier assignment'}</div>
        </div>
        <div class="meta">
          <div><strong>Courier ETA to pickup</strong></div>
          <div>${formatMinutes(order.tracking.driverEtaToPickupMinutes)}</div>
        </div>
        <div class="meta">
          <div><strong>Destination ETA</strong></div>
          <div>${formatMinutes(order.tracking.destinationEtaMinutes)}</div>
        </div>
        <div class="meta">
          <div><strong>ETA source</strong></div>
          <div>${formatEtaSource(order.tracking.etaSource)}</div>
        </div>
        <div class="meta">
          <div><strong>Courier pay for this trip</strong></div>
          <div>${currency(order.tripEarnings)}</div>
        </div>
        <div class="meta">
          <div><strong>Store charge for this trip</strong></div>
          <div>${currency(order.companyCharge)}</div>
        </div>
      </div>
    `;
    nodes.orders.appendChild(node);
  }
}

async function refreshDashboard() {
  try {
    const [profile, report, orders] = await Promise.all([
      request('/api/restaurants/me/profile', {}, false),
      request('/api/restaurants/me/report', {}, false),
      request('/api/restaurants/me/orders', {}, false),
    ]);

    hasSession = true;
    nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
    nodes.statTotal.textContent = report.totalOrders;
    nodes.statActive.textContent = report.activeOrders;
    nodes.statPayout.textContent = currency(report.totalDriverPayout);
    nodes.statCharges.textContent = currency(report.totalRestaurantCharges);
    renderTrackingSettings(profile);
    renderOrders(orders);
  } catch (error) {
    hasSession = false;
    nodes.sessionStatus.textContent = 'Not logged in';
    renderTrackingSettings(null);
    renderOrders([]);
    setConnectionState('Waiting for restaurant session.', false);
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
  if (!hasSession) {
    return;
  }

  try {
    const { ticket } = await request('/api/auth/restaurant/stream-ticket', { method: 'POST' });
    stream = new EventSource(`/api/restaurants/me/stream?ticket=${encodeURIComponent(ticket)}`);
    setConnectionState('Connecting to live restaurant updates…', false);

    stream.addEventListener('ready', () => {
      setConnectionState('Live restaurant updates connected.', true);
    });
    stream.addEventListener('restaurant-updated', async () => {
      await refreshDashboard().catch((error) => {
        console.error(error);
      });
    });
    stream.addEventListener('ping', () => {
      setConnectionState('Live restaurant updates connected.', true);
    });
    stream.onerror = () => {
      setConnectionState('Realtime link interrupted. Reconnecting…', false);
      stopStream();
      setTimeout(() => {
        connectStream().catch((error) => console.error(error));
      }, 2000);
    };
  } catch (error) {
    setConnectionState(`Realtime unavailable: ${error.message}`, false);
  }
}

async function login() {
  await request('/api/auth/restaurant/login', {
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
      await request('/api/auth/restaurant/logout', { method: 'POST' }, false);
    }
  } finally {
    hasSession = false;
    stopStream();
    await refreshDashboard().catch(() => {});
  }
}

async function createOrder() {
  await request('/api/restaurants/me/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: document.getElementById('customerName').value.trim(),
      customerAddress: document.getElementById('customerAddress').value.trim(),
      customerLatitude: Number(document.getElementById('customerLatitude').value),
      customerLongitude: Number(document.getElementById('customerLongitude').value),
      deliveryArea: document.getElementById('deliveryArea').value.trim(),
    }),
  });
  await refreshDashboard();
}

async function requestPasswordReset() {
  const email = document.getElementById('email').value.trim();
  if (!email) {
    nodes.resetStatus.textContent = 'Enter your restaurant email first.';
    return;
  }
  const result = await request('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ userType: 'restaurant', email }),
  }, false);
  nodes.resetStatus.textContent = result.debugToken
    ? `Reset token for local use: ${result.debugToken}`
    : 'Password reset request submitted.';
}

document.getElementById('loginBtn').addEventListener('click', () => login().catch((error) => {
  nodes.sessionStatus.textContent = error.message;
}));
document.getElementById('logoutBtn').addEventListener('click', () => logout().catch((error) => {
  nodes.sessionStatus.textContent = error.message;
}));
document.getElementById('createOrderBtn').addEventListener('click', () => createOrder().catch((error) => {
  nodes.sessionStatus.textContent = error.message;
}));
document.getElementById('requestResetBtn').addEventListener('click', () => requestPasswordReset().catch((error) => {
  nodes.resetStatus.textContent = error.message;
}));

refreshDashboard().catch(() => {});
