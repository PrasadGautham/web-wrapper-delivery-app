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
  });

  final bool isLoading;
  final bool isAuthenticated;
  final Driver? driver;
  final String? token;
  final String? errorMessage;

  AuthState copyWith({
    bool? isLoading,
    bool? isAuthenticated,
    Driver? driver,
    String? token,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      driver: driver ?? this.driver,
      token: token ?? this.token,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._loginUseCase, this._restoreSessionUseCase, this._logoutUseCase)
      : super(AuthState.initial());

  final LoginUseCase _loginUseCase;
  final RestoreSessionUseCase _restoreSessionUseCase;
  final LogoutUseCase _logoutUseCase;

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final (driver, token) = await _loginUseCase(email, password);
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        driver: driver,
        token: token,
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: false,
        errorMessage: error.toString(),
      );
    }
  }

  Future<void> restoreSession() async {
    state = state.copyWith(isLoading: true, clearError: true);
    final driver = await _restoreSessionUseCase();
    state = state.copyWith(
      isLoading: false,
      isAuthenticated: driver != null,
      driver: driver,
    );
  }

  Future<void> logout() async {
    await _logoutUseCase();
    state = AuthState.initial();
  }
}
