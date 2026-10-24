import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/tokens.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Space.xxl, vertical: compact ? Space.lg : Space.huge),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: c.surfaceRaised,
              shape: BoxShape.circle,
              border: Border.all(color: c.outline),
            ),
            child: Icon(icon, color: c.textSecondary, size: 22),
          ),
          const SizedBox(height: Space.lg),
          Text(title, style: context.text.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: Space.xs),
          Text(message, style: context.text.bodyMedium, textAlign: TextAlign.center),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: Space.lg),
            FilledButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry, this.compact = false});

  final String message;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.error_outline_rounded,
      title: 'Something went wrong',
      message: message,
      actionLabel: onRetry == null ? null : 'Try again',
      onAction: onRetry,
      compact: compact,
    );
  }
}

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.all(compact ? Space.lg : Space.huge),
      child: const Center(
        child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2)),
      ),
    );
  }
}

/// Renders an [AsyncValue] with consistent loading and error states.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.value,
    required this.data,
    this.compact = false,
    this.onRetry,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final bool compact;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => LoadingState(compact: compact),
      error: (e, _) => ErrorState(message: describeError(e), onRetry: onRetry, compact: compact),
    );
  }
}

String describeError(Object e) {
  final s = e.toString();
  return s.startsWith('Exception: ') ? s.substring(11) : s;
}

/// Consistent tab/page layout: large title, optional actions, sliver body.
class PageScaffold extends StatelessWidget {
  const PageScaffold({
    super.key,
    required this.title,
    required this.slivers,
    this.subtitle,
    this.actions = const [],
    this.floating,
    this.showBack = false,
  });

  final String title;
  final String? subtitle;
  final List<Widget> slivers;
  final List<Widget> actions;
  final Widget? floating;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      floatingActionButton: floating,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(showBack ? Space.sm : Space.gutter, top + Space.md, Space.md, Space.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  if (showBack) const BackButton(),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (subtitle != null)
                          Text(subtitle!.toUpperCase(), style: context.text.labelSmall),
                        Text(title, style: context.text.headlineLarge),
                      ],
                    ),
                  ),
                  ...actions,
                ],
              ),
            ),
          ),
          ...slivers,
          SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 120)),
        ],
      ),
    );
  }
}
