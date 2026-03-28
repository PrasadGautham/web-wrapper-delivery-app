import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/entities/driver.dart';
import '../../../domain/usecases/auth_usecases.dart';

class AuthState {
  factory AuthState.initial() => const AuthState(
        isLoading: false,
        isAuthenticated: false,
      );

  const AuthState({
    required this.isLoading,
    required this.isAuthenticated,
    this.driver,
    this.token,
    this.errorMessage,
    this.infoMessage,
  });

  final bool isLoading;
  final bool isAuthenticated;
  final Driver? driver;
  final String? token;
  final String? errorMessage;
  final String? infoMessage;

  AuthState copyWith({
    bool? isLoading,
    bool? isAuthenticated,
    Driver? driver,
    String? token,
    String? errorMessage,
    String? infoMessage,
    bool clearError = false,
    bool clearInfo = false,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      driver: driver ?? this.driver,
      token: token ?? this.token,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
      infoMessage: clearInfo ? null : infoMessage ?? this.infoMessage,
    );
  }
}

String _friendlyError(Object error) {
  final raw = error.toString();
  return raw.startsWith('Exception: ') ? raw.substring(11) : raw;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(
    this._loginUseCase,
    this._restoreSessionUseCase,
    this._logoutUseCase,
    this._requestPasswordResetUseCase,
    this._confirmPasswordResetUseCase,
  ) : super(AuthState.initial());

  final LoginUseCase _loginUseCase;
  final RestoreSessionUseCase _restoreSessionUseCase;
  final LogoutUseCase _logoutUseCase;
  final RequestPasswordResetUseCase _requestPasswordResetUseCase;
  final ConfirmPasswordResetUseCase _confirmPasswordResetUseCase;

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, clearError: true, clearInfo: true);
    try {
      final (driver, token) = await _loginUseCase(email, password);
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        driver: driver,
        token: token,
        clearError: true,
        clearInfo: true,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: false,
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> restoreSession() async {
    state = state.copyWith(isLoading: true, clearError: true, clearInfo: true);
    try {
      final driver = await _restoreSessionUseCase();
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: driver != null,
        driver: driver,
        clearError: true,
      );
    } catch (_) {
      state = AuthState.initial();
    }
  }

  Future<void> logout() async {
    await _logoutUseCase();
    state = AuthState.initial();
  }

  void clearSession() {
    state = AuthState.initial();
  }

  Future<void> requestPasswordReset(String email) async {
    state = state.copyWith(isLoading: true, clearError: true, clearInfo: true);
    try {
      await _requestPasswordResetUseCase(email);
      state = state.copyWith(
        isLoading: false,
        infoMessage: 'Password reset instructions requested. Check your email if delivery is configured.',
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _friendlyError(error),
      );
    }
  }

  Future<void> confirmPasswordReset({required String token, required String newPassword}) async {
    state = state.copyWith(isLoading: true, clearError: true, clearInfo: true);
    try {
      await _confirmPasswordResetUseCase(token: token, newPassword: newPassword);
      state = state.copyWith(
        isLoading: false,
        infoMessage: 'Password reset complete. Log in with the new password.',
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _friendlyError(error),
      );
    }
  }
}
