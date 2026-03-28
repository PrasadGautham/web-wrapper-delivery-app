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

  String? _token;
  String? _deviceToken;
  Future<void> Function(String?)? _persistAuthToken;
  void Function()? _onSessionExpired;
  Future<String>? _refreshingToken;

  Stream<Map<String, dynamic>?> watchDriver() => _driverController.stream;
  Stream<Map<String, dynamic>?> watchIncomingOrder() => _incomingOrderController.stream;
  Stream<Map<String, dynamic>?> watchActiveOrder() => _activeOrderController.stream;

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
      _driverController.add(null);
      _incomingOrderController.add(null);
      _activeOrderController.add(null);
      return;
    }
    unawaited(_registerDeviceTokenIfPossible());
    unawaited(refreshState());
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
    _driverController.add(response);
    return response;
  }

  Future<Map<String, dynamic>> patchDriverAvailability(bool isOnline) async {
    final response = await _request('PATCH', '/driver/availability', body: {'isOnline': isOnline});
    await refreshState();
    return response;
  }

  Future<Map<String, dynamic>?> getOrdersAvailable() => _requestNullable('GET', '/driver/orders/incoming');

  Future<Map<String, dynamic>?> getActiveOrder() => _requestNullable('GET', '/driver/orders/active');

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
    final driver = await _request('GET', '/driver/profile');
    final incoming = await _requestNullable('GET', '/driver/orders/incoming');
    final active = await _requestNullable('GET', '/driver/orders/active');
    _driverController.add(driver);
    _incomingOrderController.add(incoming);
    _activeOrderController.add(active);
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

  Future<void> dispose() async {
    _client.close();
    await _driverController.close();
    await _incomingOrderController.close();
    await _activeOrderController.close();
  }
}


