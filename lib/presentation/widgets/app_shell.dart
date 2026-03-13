import 'package:flutter/material.dart';

class AppShell extends StatelessWidget {
  const AppShell({
    required this.title,
    required this.body,
    this.actions = const [],
    this.bottomNavigationBar,
    super.key,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;
  final Widget? bottomNavigationBar;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: actions),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: body,
        ),
      ),
      bottomNavigationBar: bottomNavigationBar,
    );
  }
}
