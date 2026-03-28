import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/entities/driver.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../services/api/backend_api_client.dart';
import '../models/driver_model.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._apiClient, this._storage) {
    _apiClient.configureAuthLifecycle(
      persistAuthToken: _persistToken,
      onSessionExpired: () {
        _storage.delete(key: _tokenKey);
      },
    );
  }

  final BackendApiClient _apiClient;
  final FlutterSecureStorage _storage;

  static const _tokenKey = 'auth_token';

  @override
  Future<String?> getToken() => _storage.read(key: _tokenKey);

  @override
  Future<(Driver, String)> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.postLogin(email: email, password: password);
    final token = response['token'] as String;
    final driver = DriverModel.fromJson(response['driver'] as Map<String, dynamic>).toEntity();
    await _persistToken(token);
    return (driver, token);
  }

  @override
  Future<void> logout() async {
    await _apiClient.postLogout();
    await _persistToken(null);
  }

  @override
  Future<Driver?> restoreSession() async {
    final token = await getToken();
    if (token == null) {
      _apiClient.setAuthToken(null);
      return null;
    }
    _apiClient.setAuthToken(token);
    try {
      final driver = await _apiClient.getDriver();
      return DriverModel.fromJson(driver).toEntity();
    } catch (_) {
      await _persistToken(null);
      _apiClient.setAuthToken(null);
      return null;
    }
  }

  @override
  Future<void> requestPasswordReset(String email) {
    return _apiClient.requestPasswordReset(email);
  }

  @override
  Future<void> confirmPasswordReset({required String token, required String newPassword}) {
    return _apiClient.confirmPasswordReset(token: token, newPassword: newPassword);
  }

  Future<void> _persistToken(String? token) async {
    if (token == null) {
      await _storage.delete(key: _tokenKey);
      return;
    }
    await _storage.write(key: _tokenKey, value: token);
  }
}

