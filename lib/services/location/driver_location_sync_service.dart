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

  Future<void> sync({
    required bool isAuthenticated,
    required bool shouldTrack,
    required bool highFrequencyMode,
  }) async {
    if (!isAuthenticated || !shouldTrack) {
      await stop();
      return;
    }

    if (_running && _highFrequencyMode == highFrequencyMode) {
      return;
    }
    if (_running && _highFrequencyMode != highFrequencyMode) {
      await stop();
    }

    final permissionGranted = await _ensurePermissions();
    if (!permissionGranted) {
      _logger.w('Location permission not granted. Driver location sync remains disabled.');
      return;
    }

    final settings = _buildSettings(highFrequencyMode);

    _running = true;
    _highFrequencyMode = highFrequencyMode;
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
  }

  Future<void> stop() async {
    _running = false;
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _highFrequencyMode = false;
  }

  Future<bool> _ensurePermissions() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
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
