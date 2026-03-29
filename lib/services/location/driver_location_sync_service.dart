import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:logger/logger.dart';

import '../api/backend_api_client.dart';

class DriverLocationSyncService {
  DriverLocationSyncService(this._apiClient, this._logger);

  final BackendApiClient _apiClient;
  final Logger _logger;

  StreamSubscription<Position>? _positionSubscription;
  DateTime? _lastSentAt;
  Position? _lastSentPosition;
  bool _running = false;
  bool _highFrequencyMode = false;
  bool _syncInFlight = false;
  _LocationSyncTarget? _pendingTarget;
  _LocationSyncTarget? _lastRequestedTarget;
  Future<LocationPermission>? _permissionRequest;

  Future<void> sync({
    required bool isAuthenticated,
    required bool shouldTrack,
    required bool highFrequencyMode,
  }) async {
    final target = _LocationSyncTarget(
      isAuthenticated: isAuthenticated,
      shouldTrack: shouldTrack,
      highFrequencyMode: highFrequencyMode,
    );
    _pendingTarget = target;
    if (_syncInFlight) {
      return;
    }

    _syncInFlight = true;
    try {
      while (_pendingTarget != null) {
        final nextTarget = _pendingTarget!;
        _pendingTarget = null;
        await _applyTarget(nextTarget);
      }
    } finally {
      _syncInFlight = false;
    }
  }

  Future<void> stop() async {
    _running = false;
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _highFrequencyMode = false;
    _lastRequestedTarget = null;
  }

  Future<void> _applyTarget(_LocationSyncTarget target) async {
    if (_lastRequestedTarget == target) {
      return;
    }
    _lastRequestedTarget = target;
    final stopwatch = Stopwatch()..start();

    if (!target.isAuthenticated || !target.shouldTrack) {
      await stop();
      _logger.d('Location sync: stopped in ${stopwatch.elapsedMilliseconds}ms');
      return;
    }

    if (_running && _highFrequencyMode == target.highFrequencyMode) {
      _logger.d('Location sync: target already active, no-op in ${stopwatch.elapsedMilliseconds}ms');
      return;
    }
    if (_running && _highFrequencyMode != target.highFrequencyMode) {
      await stop();
    }

    final permissionGranted = await _ensurePermissions();
    if (!permissionGranted) {
      _logger.w('Location permission not granted. Driver location sync remains disabled.');
      return;
    }

    final settings = _buildSettings(target.highFrequencyMode);

    _running = true;
    _highFrequencyMode = target.highFrequencyMode;
    try {
      final currentPosition = await Geolocator.getCurrentPosition(locationSettings: settings);
      await _maybeSend(currentPosition, force: true);
    } catch (error, stackTrace) {
      _logger.w('Unable to obtain initial driver location.', error: error, stackTrace: stackTrace);
    }

    _positionSubscription = Geolocator.getPositionStream(locationSettings: settings).listen(
      (position) async {
        await _maybeSend(position);
      },
      onError: (Object error, StackTrace stackTrace) {
        _logger.w('Driver location stream error.', error: error, stackTrace: stackTrace);
      },
      cancelOnError: false,
    );
    _logger.i(
      'Location sync: started ${target.highFrequencyMode ? 'high-frequency' : 'standard'} mode in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  Future<bool> _ensurePermissions() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      _permissionRequest ??= Geolocator.requestPermission();
      try {
        permission = await _permissionRequest!;
      } finally {
        _permissionRequest = null;
      }
    }

    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  LocationSettings _buildSettings(bool highFrequencyMode) {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: highFrequencyMode ? LocationAccuracy.bestForNavigation : LocationAccuracy.high,
        distanceFilter: highFrequencyMode ? 10 : 30,
        intervalDuration: Duration(seconds: highFrequencyMode ? 12 : 30),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Driver tracking active',
          notificationText: 'Location is being shared for dispatch and delivery tracking.',
          enableWakeLock: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS) {
      return AppleSettings(
        accuracy: highFrequencyMode ? LocationAccuracy.bestForNavigation : LocationAccuracy.high,
        distanceFilter: highFrequencyMode ? 10 : 30,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: highFrequencyMode,
      );
    }
    return LocationSettings(
      accuracy: highFrequencyMode ? LocationAccuracy.bestForNavigation : LocationAccuracy.high,
      distanceFilter: highFrequencyMode ? 10 : 30,
    );
  }

  Future<void> _maybeSend(Position position, {bool force = false}) async {
    final now = DateTime.now().toUtc();
    final minSeconds = position.speed > 2 ? 15 : 45;

    if (!force && _lastSentAt != null && now.difference(_lastSentAt!).inSeconds < minSeconds) {
      return;
    }
    if (!force && _lastSentPosition != null) {
      final movedMeters = Geolocator.distanceBetween(
        _lastSentPosition!.latitude,
        _lastSentPosition!.longitude,
        position.latitude,
        position.longitude,
      );
      if (movedMeters < 15) {
        return;
      }
    }

    await _apiClient.postDriverLocation(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy,
      speedMetersPerSecond: position.speed,
      headingDegrees: position.heading,
      capturedAt: now,
    );
    _lastSentAt = now;
    _lastSentPosition = position;
  }

  Future<void> dispose() => stop();
}

class _LocationSyncTarget {
  const _LocationSyncTarget({
    required this.isAuthenticated,
    required this.shouldTrack,
    required this.highFrequencyMode,
  });

  final bool isAuthenticated;
  final bool shouldTrack;
  final bool highFrequencyMode;

  @override
  bool operator ==(Object other) {
    return other is _LocationSyncTarget &&
        other.isAuthenticated == isAuthenticated &&
        other.shouldTrack == shouldTrack &&
        other.highFrequencyMode == highFrequencyMode;
  }

  @override
  int get hashCode => Object.hash(isAuthenticated, shouldTrack, highFrequencyMode);
}
