import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/entities/driver.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../services/api/mock_api_client.dart';
import '../models/driver_model.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._apiClient, this._storage);

  final MockApiClient _apiClient;
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
    await _storage.write(key: _tokenKey, value: token);
    return (driver, token);
  }

  @override
  Future<void> logout() => _storage.delete(key: _tokenKey);

  @override
  Future<Driver?> restoreSession() async {
    final token = await getToken();
    if (token == null) {
      return null;
    }
    final driver = await _apiClient.getDriver();
    return DriverModel.fromJson(driver).toEntity();
  }
}
