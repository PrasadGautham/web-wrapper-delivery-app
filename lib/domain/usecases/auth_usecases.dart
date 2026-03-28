import '../entities/driver.dart';
import '../repositories/auth_repository.dart';

class LoginUseCase {
  const LoginUseCase(this._repository);

  final AuthRepository _repository;

  Future<(Driver, String)> call(String email, String password) {
    return _repository.login(email: email, password: password);
  }
}

class RestoreSessionUseCase {
  const RestoreSessionUseCase(this._repository);

  final AuthRepository _repository;

  Future<Driver?> call() => _repository.restoreSession();
}

class LogoutUseCase {
  const LogoutUseCase(this._repository);

  final AuthRepository _repository;

  Future<void> call() => _repository.logout();
}

class RequestPasswordResetUseCase {
  const RequestPasswordResetUseCase(this._repository);

  final AuthRepository _repository;

  Future<void> call(String email) => _repository.requestPasswordReset(email);
}

class ConfirmPasswordResetUseCase {
  const ConfirmPasswordResetUseCase(this._repository);

  final AuthRepository _repository;

  Future<void> call({required String token, required String newPassword}) {
    return _repository.confirmPasswordReset(token: token, newPassword: newPassword);
  }
}
