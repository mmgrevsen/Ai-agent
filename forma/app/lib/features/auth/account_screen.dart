import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/remote/backend.dart';
import '../sync/sync_controller.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signUp = false;
  bool _busy = false;
  String? _message;
  bool _isError = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<String?> Function() action) async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final msg = await action();
      if (mounted) {
        setState(() {
          _message = msg;
          _isError = false;
        });
      }
    } on BackendException catch (e) {
      if (mounted) {
        setState(() {
          _message = e.message;
          _isError = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _validEmail => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());

  @override
  Widget build(BuildContext context) {
    final backend = ref.watch(backendProvider);
    final user = ref.watch(authUserProvider).value;
    final sync = ref.watch(syncControllerProvider);
    final c = context.colors;

    if (!backend.configured) {
      return Scaffold(
        appBar: AppBar(title: const Text('Account')),
        body: const EmptyState(
          icon: Icons.cloud_off_outlined,
          title: 'Local-only build',
          message: 'This build has no server configured, so everything stays on this device. '
              'Accounts, sync, the AI coach and photo estimates need SUPABASE_URL and SUPABASE_ANON_KEY at build time.',
        ),
      );
    }

    if (user != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Account')),
        body: ListView(padding: const EdgeInsets.all(Space.gutter), children: [
          FCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Signed in as'),
              const SizedBox(height: Space.xs),
              Text(user.email ?? 'Apple ID', style: context.text.titleLarge),
              const SizedBox(height: Space.md),
              Text(
                sync.running
                    ? 'Syncing…'
                    : sync.error ?? (sync.lastSuccess == null ? 'Waiting for first sync' : 'Last synced ${relativeDay(sync.lastSuccess!)} at ${TimeOfDay.fromDateTime(sync.lastSuccess!).format(context)}'),
                style: context.text.bodyMedium?.copyWith(color: sync.error != null ? c.caution : null),
              ),
              if (sync.lastResult != null)
                Text('${sync.lastResult!.pushed} changes uploaded, ${sync.lastResult!.pulled} downloaded', style: context.text.bodySmall),
            ]),
          ),
          const SizedBox(height: Space.md),
          OutlinedButton.icon(
            onPressed: sync.running ? null : () => ref.read(syncControllerProvider.notifier).syncNow(),
            icon: const Icon(Icons.sync_rounded),
            label: const Text('Sync now'),
          ),
          const SizedBox(height: Space.sm),
          TextButton(
            onPressed: () async {
              await backend.signOut();
              if (context.mounted) Navigator.of(context).maybePop();
            },
            child: const Text('Sign out'),
          ),
          const SizedBox(height: Space.sm),
          Text('Signing out keeps your data on this device. Unsynced changes upload the next time you sign in.', style: context.text.bodySmall),
        ]),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(_signUp ? 'Create account' : 'Sign in')),
      body: ListView(padding: const EdgeInsets.all(Space.gutter), children: [
        Text(
          'An account backs up your data, syncs it across devices and enables the AI coach and photo estimates. '
          'Anything you logged without an account is uploaded to it.',
          style: context.text.bodyMedium,
        ),
        const SizedBox(height: Space.xl),
        SizedBox(
          height: 52,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: c.textPrimary, foregroundColor: c.background),
            onPressed: _busy ? null : () => _run(() async {
              await backend.signInWithApple();
              return null;
            }),
            icon: const Icon(Icons.apple),
            label: const Text('Continue with Apple'),
          ),
        ),
        const SizedBox(height: Space.xl),
        Row(children: [const Expanded(child: Divider()), Padding(padding: const EdgeInsets.symmetric(horizontal: Space.md), child: Text('or', style: context.text.bodySmall)), const Expanded(child: Divider())]),
        const SizedBox(height: Space.xl),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: [_signUp ? AutofillHints.newPassword : AutofillHints.password],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: 'Password', helperText: _signUp ? 'At least 8 characters' : null),
        ),
        const SizedBox(height: Space.lg),
        FilledButton(
          onPressed: _busy || !_validEmail || _password.text.length < (_signUp ? 8 : 1)
              ? null
              : () => _run(() async {
                    if (_signUp) {
                      final needsConfirm = await backend.signUp(_email.text, _password.text);
                      return needsConfirm ? 'Check your email to confirm your account, then sign in.' : null;
                    }
                    await backend.signInWithPassword(_email.text, _password.text);
                    return null;
                  }),
          child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_signUp ? 'Create account' : 'Sign in'),
        ),
        const SizedBox(height: Space.sm),
        TextButton(
          onPressed: _busy || !_validEmail
              ? null
              : () => _run(() async {
                    await backend.sendMagicLink(_email.text);
                    return 'We sent a sign-in link to ${_email.text.trim()}.';
                  }),
          child: const Text('Email me a sign-in link instead'),
        ),
        TextButton(
          onPressed: () => setState(() {
            _signUp = !_signUp;
            _message = null;
          }),
          child: Text(_signUp ? 'I already have an account' : 'Create an account'),
        ),
        if (_message != null) ...[
          const SizedBox(height: Space.md),
          Text(_message!, style: context.text.bodyMedium?.copyWith(color: _isError ? c.negative : c.positive)),
        ],
      ]),
    );
  }
}
