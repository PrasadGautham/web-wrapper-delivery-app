import '../entities/driver.dart';

abstract class AuthRepository {
  Future<(Driver, String)> login({
    required String email,
    required String password,
  });

  Future<Driver?> restoreSession();
  Future<void> logout();
  Future<String?> getToken();
  Future<void> requestPasswordReset(String email);
  Future<void> confirmPasswordReset({
    required String token,
    required String newPassword,
  });
}
