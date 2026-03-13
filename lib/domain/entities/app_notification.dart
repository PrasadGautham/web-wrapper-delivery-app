class AppNotification {
  const AppNotification({
    required this.title,
    required this.body,
    required this.route,
    required this.payload,
  });

  final String title;
  final String body;
  final String route;
  final Map<String, String> payload;
}
