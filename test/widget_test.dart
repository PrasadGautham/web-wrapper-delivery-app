import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:driver_app/bootstrap.dart';

void main() {
  testWidgets('app bootstrap renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: DriverAppBootstrap(),
      ),
    );
    await tester.pump();
    expect(find.byType(ProviderScope), findsOneWidget);
  });
}
