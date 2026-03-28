import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/di/providers.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../presentation/widgets/primary_button.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController(text: AppConstants.demoEmail);
  final _passwordController = TextEditingController(text: AppConstants.demoPassword);
  final _resetEmailController = TextEditingController(text: AppConstants.demoEmail);
  final _resetTokenController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _showReset = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _resetEmailController.dispose();
    _resetTokenController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final authState = ref.watch(authControllerProvider);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF0A7C86), Color(0xFF0F4C5C)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.text('appTitle'),
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Use the driver account credentials or request a password reset from this screen.',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 24),
                          TextFormField(
                            controller: _emailController,
                            decoration: InputDecoration(labelText: l10n.text('email')),
                            validator: (value) => value != null && value.contains('@')
                                ? null
                                : 'Enter a valid email',
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            decoration: InputDecoration(labelText: l10n.text('password')),
                            obscureText: true,
                            validator: (value) =>
                                value != null && value.length >= 8 ? null : 'Minimum 8 characters',
                          ),
                          const SizedBox(height: 12),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () => setState(() => _showReset = !_showReset),
                              child: Text(_showReset ? 'Hide recovery tools' : 'Forgot password?'),
                            ),
                          ),
                          if (_showReset) ...[
                            const Divider(height: 24),
                            Text(
                              'Password Recovery',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _resetEmailController,
                              decoration: const InputDecoration(labelText: 'Account email'),
                            ),
                            const SizedBox(height: 12),
                            PrimaryButton(
                              label: 'Request reset',
                              icon: Icons.mail_outline,
                              isLoading: authState.isLoading,
                              onPressed: () {
                                ref
                                    .read(authControllerProvider.notifier)
                                    .requestPasswordReset(_resetEmailController.text.trim());
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _resetTokenController,
                              decoration: const InputDecoration(labelText: 'Reset token'),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _newPasswordController,
                              decoration: const InputDecoration(
                                labelText: 'New password',
                                helperText: 'At least 10 chars with upper, lower, and number',
                              ),
                              obscureText: true,
                            ),
                            const SizedBox(height: 12),
                            PrimaryButton(
                              label: 'Confirm reset',
                              icon: Icons.lock_reset,
                              isLoading: authState.isLoading,
                              onPressed: () {
                                ref.read(authControllerProvider.notifier).confirmPasswordReset(
                                      token: _resetTokenController.text.trim(),
                                      newPassword: _newPasswordController.text,
                                    );
                              },
                            ),
                          ],
                          if (authState.errorMessage != null) ...[
                            const SizedBox(height: 16),
                            Text(
                              authState.errorMessage!,
                              style: TextStyle(color: Theme.of(context).colorScheme.error),
                            ),
                          ],
                          if (authState.infoMessage != null) ...[
                            const SizedBox(height: 16),
                            Text(
                              authState.infoMessage!,
                              style: TextStyle(color: Theme.of(context).colorScheme.primary),
                            ),
                          ],
                          const SizedBox(height: 24),
                          PrimaryButton(
                            label: l10n.text('login'),
                            icon: Icons.login,
                            isLoading: authState.isLoading,
                            onPressed: () {
                              if (_formKey.currentState?.validate() ?? false) {
                                ref.read(authControllerProvider.notifier).login(
                                      _emailController.text.trim(),
                                      _passwordController.text.trim(),
                                    );
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
