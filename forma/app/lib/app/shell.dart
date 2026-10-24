import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_theme.dart';
import '../core/theme/tokens.dart';
import '../core/util/format.dart';
import '../features/workout/workout_providers.dart';

class _Tab {
  const _Tab(this.label, this.icon, this.activeIcon);
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

const _tabs = [
  _Tab('Overview', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded),
  _Tab('Workout', Icons.fitness_center_outlined, Icons.fitness_center_rounded),
  _Tab('Nutrition', Icons.restaurant_outlined, Icons.restaurant_rounded),
  _Tab('Progress', Icons.insights_outlined, Icons.insights_rounded),
  _Tab('Coach', Icons.auto_awesome_outlined, Icons.auto_awesome),
];

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final active = ref.watch(activeWorkoutProvider).value;
    return Scaffold(
      body: shell,
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedSize(
            duration: Motion.medium,
            curve: Motion.standard,
            child: active == null ? const SizedBox(width: double.infinity) : _ActiveWorkoutBar(workoutId: active.id, name: active.name, startedAt: active.startedAt),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: c.background,
              border: Border(top: BorderSide(color: c.outline)),
            ),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 58,
                child: Row(
                  children: [
                    for (final (i, t) in _tabs.indexed)
                      Expanded(
                        child: _NavItem(
                          tab: t,
                          selected: shell.currentIndex == i,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            shell.goBranch(i, initialLocation: i == shell.currentIndex);
                          },
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.tab, required this.selected, required this.onTap});

  final _Tab tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = selected ? c.textPrimary : c.textTertiary;
    return Semantics(
      button: true,
      selected: selected,
      label: tab.label,
      child: InkResponse(
        onTap: onTap,
        radius: 36,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedSwitcher(
              duration: Motion.fast,
              child: Icon(selected ? tab.activeIcon : tab.icon, key: ValueKey(selected), color: color, size: 23),
            ),
            const SizedBox(height: 3),
            Text(
              tab.label,
              style: context.text.labelSmall?.copyWith(color: color, letterSpacing: 0.2, fontSize: 10.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// Persistent bar that returns to an in-progress workout from any tab.
class _ActiveWorkoutBar extends StatefulWidget {
  const _ActiveWorkoutBar({required this.workoutId, required this.name, required this.startedAt});

  final String workoutId;
  final String name;
  final DateTime startedAt;

  @override
  State<_ActiveWorkoutBar> createState() => _ActiveWorkoutBarState();
}

class _ActiveWorkoutBarState extends State<_ActiveWorkoutBar> {
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final elapsed = DateTime.now().toUtc().difference(widget.startedAt);
    return Material(
      color: c.surfaceRaised,
      child: InkWell(
        onTap: () => context.push('/session/${widget.workoutId}'),
        child: Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.outline))),
          child: Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle)),
              const SizedBox(width: Space.md),
              Expanded(
                child: Text(widget.name, style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              Text(clock(elapsed), style: context.text.titleSmall?.copyWith(fontFeatures: tabularFigures, color: c.textSecondary)),
              const SizedBox(width: Space.sm),
              Icon(Icons.keyboard_arrow_up_rounded, color: c.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
