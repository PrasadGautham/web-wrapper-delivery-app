class MockSeed {
  const MockSeed._();

  static Map<String, dynamic> driver() {
    return {
      'id': 'drv_1f2c9a44',
      'name': 'Alex Driver',
      'email': 'driver@demo.com',
      'rating': 4.9,
      'completedOrders': 0,
      'totalDistanceKm': 0.0,
      'isOnline': false,
      'currentLocation': {
        'latitude': 25.0829,
        'longitude': 55.1451,
        'accuracyMeters': null,
        'speedMetersPerSecond': null,
        'headingDegrees': null,
        'capturedAt': null,
      },
      'maxActiveOrders': 1,
      'currentLoad': 0,
      'locationFreshness': 'missing',
    };
  }

  static List<Map<String, dynamic>> orders() {
    return [
      {
        'id': 'order-1001',
        'restaurant': {
          'name': 'Falafel Corner',
          'address': 'Jumeirah Lake Towers, Dubai',
          'latitude': 25.0763,
          'longitude': 55.1442,
        },
        'customer': {
          'name': 'Customer One',
          'address': 'Dubai Marina, Dubai',
          'latitude': 25.0845,
          'longitude': 55.1417,
        },
        'status': 'pending',
        'deliveryArea': 'Dubai Marina',
        'distanceKm': 1.8,
        'estimatedKm': 4.6,
        'estimatedMinutes': 18,
        'driverDisplayDistanceKm': 4.6,
        'driverDisplayMinutes': 18,
        'driverDisplayMode': 'storeToCustomer',
        'tripEarnings': 23.5,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'expiresAt': DateTime.now().toUtc().add(const Duration(seconds: 30)).toIso8601String(),
      },
    ];
  }

  static Map<String, dynamic> earnings() {
    return {
      'daily': 0.0,
      'weekly': 0.0,
      'total': 0.0,
      'completedDeliveries': 0,
      'distanceTravelledKm': 0.0,
      'points': [
        {'label': 'Mon', 'amount': 0.0},
        {'label': 'Tue', 'amount': 0.0},
        {'label': 'Wed', 'amount': 0.0},
        {'label': 'Thu', 'amount': 0.0},
        {'label': 'Fri', 'amount': 0.0},
        {'label': 'Sat', 'amount': 0.0},
        {'label': 'Sun', 'amount': 0.0},
      ],
    };
  }
}

