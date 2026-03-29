import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/di/providers.dart';

class DriverAppBootstrap extends ConsumerStatefulWidget {
  const DriverAppBootstrap({super.key});

  @override
  ConsumerState<DriverAppBootstrap> createState() => _DriverAppBootstrapState();
}

class _DriverAppBootstrapState extends ConsumerState<DriverAppBootstrap> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(appStartupProvider).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    return const DriverApp();
  }
}
