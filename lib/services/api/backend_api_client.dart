import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';

class BackendApiClient {
  BackendApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  final _driverController = StreamController<Map<String, dynamic>?>.broadcast();
  final _incomingOrderController = StreamController<Map<String, dynamic>?>.broadcast();
  final _activeOrderController = StreamController<Map<String, dynamic>?>.broadcast();
  final _incomingOrdersController = StreamController<List<Map<String, dynamic>>>.broadcast();
  final _activeOrdersController = StreamController<List<Map<String, dynamic>>>.broadcast();

  String? _token;
  String? _deviceToken;
  Future<void> Function(String?)? _persistAuthToken;
  void Function()? _onSessionExpired;
  Future<String>? _refreshingToken;
  Timer? _refreshTimer;
  bool _refreshInFlight = false;
  String? _lastDriverSnapshot;
  String? _lastIncomingOrderSnapshot;
  String? _lastActiveOrderSnapshot;
  String? _lastIncomingOrdersSnapshot;
  String? _lastActiveOrdersSnapshot;

  Stream<Map<String, dynamic>?> watchDriver() => _driverController.stream;
  Stream<Map<String, dynamic>?> watchIncomingOrder() => _incomingOrderController.stream;
  Stream<Map<String, dynamic>?> watchActiveOrder() => _activeOrderController.stream;
  Stream<List<Map<String, dynamic>>> watchIncomingOrders() => _incomingOrdersController.stream;
  Stream<List<Map<String, dynamic>>> watchActiveOrders() => _activeOrdersController.stream;

  void configureAuthLifecycle({
    Future<void> Function(String?)? persistAuthToken,
    void Function()? onSessionExpired,
  }) {
    _persistAuthToken = persistAuthToken;
    _onSessionExpired = onSessionExpired;
  }

  void setAuthToken(String? token) {
    _token = token;
    unawaited(_persistAuthToken?.call(token));
    if (token == null) {
      _stopRefreshLoop();
      _emitIfChanged(_driverController, null, lastSnapshot: () => _lastDriverSnapshot, updateSnapshot: (value) => _lastDriverSnapshot = value);
      _emitIfChanged(_incomingOrderController, null, lastSnapshot: () => _lastIncomingOrderSnapshot, updateSnapshot: (value) => _lastIncomingOrderSnapshot = value);
      _emitIfChanged(_activeOrderController, null, lastSnapshot: () => _lastActiveOrderSnapshot, updateSnapshot: (value) => _lastActiveOrderSnapshot = value);
      _emitListIfChanged(_incomingOrdersController, const [], lastSnapshot: () => _lastIncomingOrdersSnapshot, updateSnapshot: (value) => _lastIncomingOrdersSnapshot = value);
      _emitListIfChanged(_activeOrdersController, const [], lastSnapshot: () => _lastActiveOrdersSnapshot, updateSnapshot: (value) => _lastActiveOrdersSnapshot = value);
      return;
    }
    _startRefreshLoop();
    unawaited(_registerDeviceTokenIfPossible());
  }

  void setDeviceToken(String token) {
    _deviceToken = token;
    unawaited(_registerDeviceTokenIfPossible());
  }

  Future<Map<String, dynamic>> postLogin({
    required String email,
    required String password,
  }) async {
    final response = await _request(
      'POST',
      '/auth/driver/login',
      body: {'email': email, 'password': password},
      authenticated: false,
      retryOnUnauthorized: false,
    );
    final token = response['token'] as String;
    setAuthToken(token);
    return response;
  }

  Future<void> postLogout() async {
    if (_token == null) {
      return;
    }
    try {
      await _request('POST', '/auth/driver/logout', retryOnUnauthorized: false);
    } finally {
      setAuthToken(null);
    }
  }

  Future<void> requestPasswordReset(String email) async {
    await _request(
      'POST',
      '/auth/password-reset/request',
      body: {'userType': 'driver', 'email': email},
      authenticated: false,
      retryOnUnauthorized: false,
    );
  }

  Future<void> confirmPasswordReset({
    required String token,
    required String newPassword,
  }) async {
    await _request(
      'POST',
      '/auth/password-reset/confirm',
      body: {'userType': 'driver', 'token': token, 'newPassword': newPassword},
      authenticated: false,
      retryOnUnauthorized: false,
    );
  }

  Future<void> registerDeviceToken(String token) async {
    _deviceToken = token;
    await _registerDeviceTokenIfPossible();
  }

  Future<Map<String, dynamic>> getDriver() => _request('GET', '/driver/profile');

  Future<Map<String, dynamic>> postDriverLocation({
    required double latitude,
    required double longitude,
    double? accuracyMeters,
    double? speedMetersPerSecond,
    double? headingDegrees,
    required DateTime capturedAt,
  }) async {
    final response = await _request('POST', '/driver/location', body: {
      'latitude': latitude,
      'longitude': longitude,
      'accuracyMeters': accuracyMeters,
      'speedMetersPerSecond': speedMetersPerSecond,
      'headingDegrees': headingDegrees,
      'capturedAt': capturedAt.toUtc().toIso8601String(),
    });
    _emitIfChanged(
      _driverController,
      response,
      lastSnapshot: () => _lastDriverSnapshot,
      updateSnapshot: (value) => _lastDriverSnapshot = value,
    );
    return response;
  }

  Future<Map<String, dynamic>> patchDriverAvailability(bool isOnline) async {
    final response = await _request('PATCH', '/driver/availability', body: {'isOnline': isOnline});
    await refreshState();
    return response;
  }

  Future<Map<String, dynamic>?> getOrdersAvailable() => _requestNullable('GET', '/driver/orders/incoming');

  Future<List<Map<String, dynamic>>> getOrdersAvailableList() => _requestList('GET', '/driver/orders/incoming-list');

  Future<Map<String, dynamic>?> getActiveOrder() => _requestNullable('GET', '/driver/orders/active');

  Future<List<Map<String, dynamic>>> getActiveOrdersList() => _requestList('GET', '/driver/orders/active-list');

  Future<Map<String, dynamic>> postAccept(String orderId) async {
    final response = await _request('POST', '/driver/orders/$orderId/accept');
    await refreshState();
    return response;
  }

  Future<void> postReject(String orderId, {bool expired = false}) async {
    await _request('POST', '/driver/orders/$orderId/reject', body: {'expired': expired});
    await refreshState();
  }

  Future<Map<String, dynamic>> postArrived(String orderId) async {
    final response = await _request('POST', '/driver/orders/$orderId/arrived');
    await refreshState();
    return response;
  }

  Future<Map<String, dynamic>> postPickup(String orderId) async {
    final response = await _request('POST', '/driver/orders/$orderId/pickup');
    await refreshState();
    return response;
  }

  Future<Map<String, dynamic>> postDeliver(String orderId) async {
    final response = await _request('POST', '/driver/orders/$orderId/deliver');
    await refreshState();
    return response;
  }

  Future<Map<String, dynamic>> getDriverEarnings() => _request('GET', '/driver/earnings');

  Future<void> refreshState() async {
    if (_token == null) {
      return;
    }
    final results = await Future.wait<dynamic>([
      _request('GET', '/driver/profile'),
      _requestList('GET', '/driver/orders/incoming-list'),
      _requestList('GET', '/driver/orders/active-list'),
    ]);
    final driver = results[0] as Map<String, dynamic>;
    final incomingOrders = results[1] as List<Map<String, dynamic>>;
    final activeOrders = results[2] as List<Map<String, dynamic>>;
    final incoming = incomingOrders.isEmpty ? null : incomingOrders.first;
    final active = activeOrders.isEmpty ? null : activeOrders.first;
    _emitIfChanged(
      _driverController,
      driver,
      lastSnapshot: () => _lastDriverSnapshot,
      updateSnapshot: (value) => _lastDriverSnapshot = value,
    );
    _emitIfChanged(
      _incomingOrderController,
      incoming,
      lastSnapshot: () => _lastIncomingOrderSnapshot,
      updateSnapshot: (value) => _lastIncomingOrderSnapshot = value,
    );
    _emitIfChanged(
      _activeOrderController,
      active,
      lastSnapshot: () => _lastActiveOrderSnapshot,
      updateSnapshot: (value) => _lastActiveOrderSnapshot = value,
    );
    _emitListIfChanged(
      _incomingOrdersController,
      incomingOrders,
      lastSnapshot: () => _lastIncomingOrdersSnapshot,
      updateSnapshot: (value) => _lastIncomingOrdersSnapshot = value,
    );
    _emitListIfChanged(
      _activeOrdersController,
      activeOrders,
      lastSnapshot: () => _lastActiveOrdersSnapshot,
      updateSnapshot: (value) => _lastActiveOrdersSnapshot = value,
    );
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
    bool retryOnUnauthorized = true,
  }) async {
    final response = await _performHttp(method, path, body: body, authenticated: authenticated);

    if (response.statusCode == 401 && authenticated && retryOnUnauthorized && _token != null) {
      final refreshed = await _tryRefreshSession();
      if (refreshed) {
        return _request(
          method,
          path,
          body: body,
          authenticated: authenticated,
          retryOnUnauthorized: false,
        );
      }
    }

    if (response.statusCode >= 400) {
      final decoded = _decodeAny(response.body);
      final message = decoded is Map && decoded['message'] != null
          ? decoded['message'] as String
          : 'Request failed (${response.statusCode})';
      throw Exception(message);
    }

    final decoded = _decodeAny(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    if (decoded is Map) {
      return Map<String, dynamic>.from(decoded);
    }
    return <String, dynamic>{};
  }

  Future<Map<String, dynamic>?> _requestNullable(String method, String path) async {
    final response = await _request(method, path);
    return response.isEmpty ? null : response;
  }
  Future<List<Map<String, dynamic>>> _requestList(String method, String path) async {
    final response = await _performHttp(method, path, authenticated: true);

    if (response.statusCode == 401 && _token != null) {
      final refreshed = await _tryRefreshSession();
      if (refreshed) {
        return _requestList(method, path);
      }
    }

    if (response.statusCode >= 400) {
      final decoded = _decodeAny(response.body);
      final message = decoded is Map && decoded['message'] != null
          ? decoded['message'] as String
          : 'Request failed (${response.statusCode})';
      throw Exception(message);
    }

    final decoded = _decodeAny(response.body);
    if (decoded is List) {
      return decoded.map((item) => Map<String, dynamic>.from(item as Map)).toList();
    }
    return const [];
  }

  Future<http.Response> _performHttp(
    String method,
    String path, {
    Map<String, dynamic>? body,
    required bool authenticated,
  }) async {
    final uri = Uri.parse('${AppConfig.backendApiBaseUrl}$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (authenticated && _token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }

    if (method == 'GET') {
      return _client.get(uri, headers: headers);
    }
    if (method == 'POST') {
      return _client.post(uri, headers: headers, body: jsonEncode(body ?? {}));
    }
    if (method == 'PATCH') {
      return _client.patch(uri, headers: headers, body: jsonEncode(body ?? {}));
    }
    throw UnsupportedError('Unsupported method: $method');
  }

  Future<bool> _tryRefreshSession() async {
    if (_token == null) {
      return false;
    }
    _refreshingToken ??= () async {
      final response = await _performHttp(
        'POST',
        '/auth/driver/refresh',
        authenticated: true,
      );
      if (response.statusCode >= 400) {
        throw Exception('Session refresh failed');
      }
      final decoded = _decodeAny(response.body) as Map<String, dynamic>;
      final nextToken = decoded['token'] as String;
      _token = nextToken;
      await _persistAuthToken?.call(nextToken);
      return nextToken;
    }();

    try {
      await _refreshingToken;
      return true;
    } catch (_) {
      _token = null;
      await _persistAuthToken?.call(null);
      _stopRefreshLoop();
      _onSessionExpired?.call();
      return false;
    } finally {
      _refreshingToken = null;
    }
  }

  dynamic _decodeAny(String body) {
    if (body.trim().isEmpty || body.trim() == 'null') {
      return null;
    }
    return jsonDecode(body);
  }

  Future<void> _registerDeviceTokenIfPossible() async {
    if (_token == null || _deviceToken == null) {
      return;
    }
    try {
      await _request('POST', '/driver/devices/token', body: {'token': _deviceToken});
    } catch (_) {
      // Keep the token and retry on the next auth/token signal.
    }
  }

  void _emitIfChanged(
    StreamController<Map<String, dynamic>?> controller,
    Map<String, dynamic>? payload, {
    required String? Function() lastSnapshot,
    required void Function(String?) updateSnapshot,
  }) {
    final snapshot = payload == null ? null : jsonEncode(payload);
    if (snapshot == lastSnapshot()) {
      return;
    }
    updateSnapshot(snapshot);
    controller.add(payload);
  }

  void _emitListIfChanged(
    StreamController<List<Map<String, dynamic>>> controller,
    List<Map<String, dynamic>> payload, {
    required String? Function() lastSnapshot,
    required void Function(String?) updateSnapshot,
  }) {
    final snapshot = jsonEncode(payload);
    if (snapshot == lastSnapshot()) {
      return;
    }
    updateSnapshot(snapshot);
    controller.add(payload);
  }

  void _startRefreshLoop() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      unawaited(_safeRefreshState());
    });
  }

  void _stopRefreshLoop() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _refreshInFlight = false;
  }

  Future<void> _safeRefreshState() async {
    if (_refreshInFlight || _token == null) {
      return;
    }
    _refreshInFlight = true;
    try {
      await refreshState();
    } catch (_) {
      // Fallback polling is best-effort. Auth refresh and foreground actions still handle hard failures.
    } finally {
      _refreshInFlight = false;
    }
  }

  Future<void> dispose() async {
    _stopRefreshLoop();
    _client.close();
    await _driverController.close();
    await _incomingOrderController.close();
    await _activeOrderController.close();
    await _incomingOrdersController.close();
    await _activeOrdersController.close();
  }
}
