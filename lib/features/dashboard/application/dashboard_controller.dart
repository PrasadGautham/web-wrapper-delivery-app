import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/entities/driver.dart';
import '../../../domain/entities/earnings.dart';
import '../../../domain/usecases/driver_usecases.dart';

class DashboardState {
  const DashboardState({
    this.driver,
    this.earnings,
    this.isLoading = true,
    this.errorMessage,
  });

  final Driver? driver;
  final Earnings? earnings;
  final bool isLoading;
  final String? errorMessage;

  DashboardState copyWith({
    Driver? driver,
    Earnings? earnings,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return DashboardState(
      driver: driver ?? this.driver,
      earnings: earnings ?? this.earnings,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}

class DashboardController extends StateNotifier<DashboardState> {
  DashboardController(
    this._watchDriver,
    this._getDriver,
    this._getEarnings,
    this._updateAvailability,
  )
      : super(const DashboardState());

  final WatchDriverUseCase _watchDriver;
  final GetDriverUseCase _getDriver;
  final GetEarningsUseCase _getEarnings;
  final UpdateAvailabilityUseCase _updateAvailability;

  StreamSubscription<Driver?>? _driverSubscription;
  bool _initialized = false;
  bool _refreshInFlight = false;

  void initialize() {
    if (_initialized) {
      return;
    }
    _initialized = true;
    _driverSubscription ??= _watchDriver().listen((driver) {
      state = state.copyWith(driver: driver, isLoading: false);
    });
    unawaited(refresh());
  }

  Future<void> refresh() async {
    if (_refreshInFlight) {
      return;
    }
    _refreshInFlight = true;
    try {
      final driver = await _getDriver();
      final earnings = await _getEarnings();
      state = state.copyWith(
        driver: driver,
        earnings: earnings,
        isLoading: false,
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: state.driver == null ? null : error.toString());
    } finally {
      _refreshInFlight = false;
    }
  }

  Future<void> toggleOnline(bool isOnline) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final driver = await _updateAvailability(isOnline);
      final earnings = await _getEarnings();
      state = state.copyWith(
        driver: driver,
        earnings: earnings,
        isLoading: false,
      );
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
    }
  }

  Future<void> resetForLogout() async {
    try {
      final shouldGoOffline = state.driver?.isOnline == true;
      if (shouldGoOffline) {
        await _updateAvailability(false);
      }
    } catch (_) {
      // Best effort during logout; clear local state either way.
    }

    state = const DashboardState(
      isLoading: false,
    );
    _initialized = false;
    _refreshInFlight = false;
  }

  void disposeResources() {
    _driverSubscription?.cancel();
  }
}
