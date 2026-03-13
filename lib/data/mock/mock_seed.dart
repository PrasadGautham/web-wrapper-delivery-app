class MockSeed {
  const MockSeed._();

  static Map<String, dynamic> driver() {
    return {
      'id': 'driver-001',
      'name': 'Alex Driver',
      'email': 'driver@demo.com',
      'rating': 4.9,
      'completedOrders': 128,
      'totalDistanceKm': 1842.4,
      'isOnline': false,
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
        'tripEarnings': 23.5,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'expiresAt': DateTime.now().toUtc().add(const Duration(seconds: 30)).toIso8601String(),
      },
      {
        'id': 'order-1002',
        'restaurant': {
          'name': 'Burger Express',
          'address': 'Business Bay, Dubai',
          'latitude': 25.1868,
          'longitude': 55.2600,
        },
        'customer': {
          'name': 'Customer Two',
          'address': 'Downtown Dubai',
          'latitude': 25.1945,
          'longitude': 55.2744,
        },
        'status': 'pending',
        'deliveryArea': 'Downtown',
        'distanceKm': 2.1,
        'estimatedKm': 6.0,
        'estimatedMinutes': 24,
        'tripEarnings': 28.0,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'expiresAt': DateTime.now().toUtc().add(const Duration(seconds: 30)).toIso8601String(),
      },
      {
        'id': 'order-1003',
        'restaurant': {
          'name': 'Sushi Lab',
          'address': 'City Walk, Dubai',
          'latitude': 25.2075,
          'longitude': 55.2668,
        },
        'customer': {
          'name': 'Customer Three',
          'address': 'Al Safa, Dubai',
          'latitude': 25.1859,
          'longitude': 55.2357,
        },
        'status': 'pending',
        'deliveryArea': 'Al Safa',
        'distanceKm': 3.4,
        'estimatedKm': 8.2,
        'estimatedMinutes': 29,
        'tripEarnings': 35.0,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
        'expiresAt': DateTime.now().toUtc().add(const Duration(seconds: 30)).toIso8601String(),
      },
    ];
  }

  static Map<String, dynamic> earnings() {
    return {
      'daily': 186.75,
      'weekly': 1048.40,
      'total': 28461.90,
      'completedDeliveries': 128,
      'distanceTravelledKm': 1842.4,
      'points': [
        {'label': 'Mon', 'amount': 122.0},
        {'label': 'Tue', 'amount': 134.0},
        {'label': 'Wed', 'amount': 162.5},
        {'label': 'Thu', 'amount': 186.75},
        {'label': 'Fri', 'amount': 154.0},
        {'label': 'Sat', 'amount': 171.0},
        {'label': 'Sun', 'amount': 118.0},
      ],
    };
  }
}
