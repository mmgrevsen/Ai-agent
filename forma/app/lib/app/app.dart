import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../content/content_providers.dart';
import '../core/theme/app_theme.dart';
import '../features/sync/sync_controller.dart';
import 'providers.dart';
import 'router.dart';

class FormaApp extends ConsumerWidget {
  const FormaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final mode = switch (ref.watch(prefsProvider).value?.themeMode) {
      'light' => ThemeMode.light,
      'system' => ThemeMode.system,
      _ => ThemeMode.dark,
    };
    // Keeps background sync running while signed in.
    ref.watch(syncControllerProvider);
    // Checks for content updates and confirms the content started fine.
    ref.watch(contentUpdaterProvider);
    return MaterialApp.router(
      title: 'Forma',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: mode,
      routerConfig: router,
    );
  }
}
