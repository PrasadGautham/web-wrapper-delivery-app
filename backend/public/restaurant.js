const apiBase = '';
let token = localStorage.getItem('restaurantToken') || '';
let stream = null;
let refreshingToken = null;

const nodes = {
  sessionStatus: document.getElementById('sessionStatus'),
  connectionText: document.getElementById('connectionText'),
  connectionDot: document.getElementById('connectionDot'),
  trackingSettings: document.getElementById('trackingSettings'),
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
    return 'Not enabled';
  }
  return `${value} min`;
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

  if (response.status === 401 && token && attemptRefresh && !path.includes('/auth/restaurant/refresh')) {
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
  if (!token) {
    throw new Error('No active session');
  }
  if (!refreshingToken) {
    refreshingToken = request('/api/auth/restaurant/refresh', { method: 'POST' }, false)
      .then((result) => {
        token = result.token;
        localStorage.setItem('restaurantToken', token);
        return token;
      })
      .catch((error) => {
        token = '';
        localStorage.removeItem('restaurantToken');
        stopStream();
        throw error;
      })
      .finally(() => {
        refreshingToken = null;
      });
  }
  return refreshingToken;
}

function renderTrackingSettings(profile) {
  const settings = profile?.trackingSettings;
  if (!settings) {
    nodes.trackingSettings.textContent = 'No active store session.';
    return;
  }
  nodes.trackingSettings.innerHTML = [
    `Pickup shown as in transit: <strong>${settings.showPickedUpAsInTransit ? 'On' : 'Off'}</strong>`,
    `Driver ETA to pickup: <strong>${settings.showDriverEtaToPickup ? 'On' : 'Off'}</strong>`,
    `Destination ETA: <strong>${settings.showDestinationEta ? 'On' : 'Off'}</strong>`,
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
          <div><strong>Assigned driver</strong></div>
          <div>${order.tracking.assignedDriverName || 'Waiting for dispatch'}</div>
        </div>
        <div class="meta">
          <div><strong>Driver ETA to pickup</strong></div>
          <div>${formatMinutes(order.tracking.driverEtaToPickupMinutes)}</div>
        </div>
        <div class="meta">
          <div><strong>Destination ETA</strong></div>
          <div>${formatMinutes(order.tracking.destinationEtaMinutes)}</div>
        </div>
        <div class="meta">
          <div><strong>ETA source</strong></div>
          <div>${order.tracking.etaSource}</div>
        </div>
        <div class="meta">
          <div><strong>Driver payout</strong></div>
          <div>${currency(order.tripEarnings)}</div>
        </div>
        <div class="meta">
          <div><strong>Store charge</strong></div>
          <div>${currency(order.companyCharge)}</div>
        </div>
      </div>
    `;
    nodes.orders.appendChild(node);
  }
}

async function refreshDashboard() {
  if (!token) {
    nodes.sessionStatus.textContent = 'Not logged in';
    renderTrackingSettings(null);
    renderOrders([]);
    setConnectionState('Waiting for restaurant session.', false);
    return;
  }

  const [profile, report, orders] = await Promise.all([
    request('/api/restaurants/me/profile'),
    request('/api/restaurants/me/report'),
    request('/api/restaurants/me/orders'),
  ]);

  nodes.sessionStatus.textContent = `Logged in as ${profile.name}`;
  nodes.statTotal.textContent = report.totalOrders;
  nodes.statActive.textContent = report.activeOrders;
  nodes.statPayout.textContent = currency(report.totalDriverPayout);
  nodes.statCharges.textContent = currency(report.totalRestaurantCharges);
  renderTrackingSettings(profile);
  renderOrders(orders);
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
  const result = await request('/api/auth/restaurant/login', {
    method: 'POST',
    body: JSON.stringify({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value.trim(),
    }),
  }, false);
  token = result.token;
  localStorage.setItem('restaurantToken', token);
  await refreshDashboard();
  await connectStream();
}

async function logout() {
  try {
    if (token) {
      await request('/api/auth/restaurant/logout', { method: 'POST' });
    }
  } finally {
    token = '';
    localStorage.removeItem('restaurantToken');
    stopStream();
    await refreshDashboard();
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
  const result = await request('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({
      userType: 'restaurant',
      email: document.getElementById('resetEmail').value.trim(),
    }),
  }, false);
  nodes.resetStatus.textContent = result.debugToken
    ? `Reset requested. Debug token: ${result.debugToken}`
    : 'Reset requested. Check email if SMTP delivery is configured.';
}

async function confirmPasswordReset() {
  await request('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({
      userType: 'restaurant',
      token: document.getElementById('resetToken').value.trim(),
      newPassword: document.getElementById('newPassword').value,
    }),
  }, false);
  nodes.resetStatus.textContent = 'Password reset complete. You can now log in with the new password.';
}

document.getElementById('loginBtn').addEventListener('click', () => {
  login().catch((error) => alert(error.message));
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  logout().catch((error) => alert(error.message));
});
document.getElementById('createOrderBtn').addEventListener('click', () => {
  createOrder().catch((error) => alert(error.message));
});
document.getElementById('manualRefreshBtn').addEventListener('click', () => {
  refreshDashboard().catch((error) => alert(error.message));
});
document.getElementById('showResetBtn').addEventListener('click', () => {
  nodes.resetPanel.classList.toggle('hidden');
});
document.getElementById('requestResetBtn').addEventListener('click', () => {
  requestPasswordReset().catch((error) => {
    nodes.resetStatus.textContent = error.message;
  });
});
document.getElementById('confirmResetBtn').addEventListener('click', () => {
  confirmPasswordReset().catch((error) => {
    nodes.resetStatus.textContent = error.message;
  });
});

refreshDashboard().catch((error) => console.error(error));
if (token) {
  connectStream().catch((error) => console.error(error));
}
setInterval(() => {
  if (token) {
    refreshSession().catch(() => {});
  }
}, 10 * 60 * 1000);


