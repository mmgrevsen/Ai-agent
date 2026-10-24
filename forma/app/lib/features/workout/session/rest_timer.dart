import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/util/format.dart';

class RestTimerState {
  const RestTimerState({this.endsAt, this.total = 0});
  final DateTime? endsAt;
  final int total;

  bool get running => endsAt != null;
}

/// Rest timer based on an absolute end time, so it stays correct if the app
/// is backgrounded or the screen rebuilds.
class RestTimer extends Notifier<RestTimerState> {
  @override
  RestTimerState build() => const RestTimerState();

  void start(int seconds) {
    if (seconds <= 0) return;
    state = RestTimerState(endsAt: DateTime.now().add(Duration(seconds: seconds)), total: seconds);
  }

  void adjust(int seconds) {
    final end = state.endsAt;
    if (end == null) return;
    final next = end.add(Duration(seconds: seconds));
    if (next.isBefore(DateTime.now())) {
      skip();
      return;
    }
    state = RestTimerState(endsAt: next, total: (state.total + seconds).clamp(1, 3600));
  }

  void skip() => state = const RestTimerState();
}

final restTimerProvider = NotifierProvider<RestTimer, RestTimerState>(RestTimer.new);

class RestTimerBar extends ConsumerStatefulWidget {
  const RestTimerBar({super.key});

  @override
  ConsumerState<RestTimerBar> createState() => _RestTimerBarState();
}

class _RestTimerBarState extends ConsumerState<RestTimerBar> {
  Timer? _ticker;
  bool _notified = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(milliseconds: 250), (_) => _tick());
  }

  void _tick() {
    final s = ref.read(restTimerProvider);
    if (!s.running) return;
    final left = s.endsAt!.difference(DateTime.now());
    if (left.isNegative && !_notified) {
      _notified = true;
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.alert);
    }
    if (left.inSeconds < -30) ref.read(restTimerProvider.notifier).skip();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(restTimerProvider);
    if (s.running) {
      final left = s.endsAt!.difference(DateTime.now());
      if (!left.isNegative) _notified = false;
    }
    final c = context.colors;
    return AnimatedSwitcher(
      duration: Motion.medium,
      transitionBuilder: (child, a) => SizeTransition(sizeFactor: a, alignment: Alignment.topCenter, child: child),
      child: !s.running
          ? const SizedBox(width: double.infinity)
          : Builder(builder: (context) {
              final left = s.endsAt!.difference(DateTime.now());
              final done = left.isNegative;
              final fraction = s.total == 0 ? 0.0 : (left.inMilliseconds / (s.total * 1000)).clamp(0.0, 1.0);
              return Container(
                key: const ValueKey('rest'),
                decoration: BoxDecoration(color: c.surfaceRaised, border: Border(top: BorderSide(color: c.outline))),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LinearProgressIndicator(value: fraction, minHeight: 2, color: done ? c.positive : c.accent),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.md, Space.sm),
                      child: Row(
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(done ? 'REST DONE' : 'REST', style: context.text.labelSmall?.copyWith(color: done ? c.positive : null)),
                              Text(
                                clock(done ? Duration.zero : left + const Duration(milliseconds: 999)),
                                style: context.text.displaySmall?.copyWith(fontFeatures: tabularFigures),
                              ),
                            ],
                          ),
                          const Spacer(),
                          _TimerButton(label: '−15', onTap: () => ref.read(restTimerProvider.notifier).adjust(-15)),
                          const SizedBox(width: Space.sm),
                          _TimerButton(label: '+15', onTap: () => ref.read(restTimerProvider.notifier).adjust(15)),
                          const SizedBox(width: Space.sm),
                          _TimerButton(label: 'Skip', onTap: () => ref.read(restTimerProvider.notifier).skip(), emphasized: true),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
    );
  }
}

class _TimerButton extends StatelessWidget {
  const _TimerButton({required this.label, required this.onTap, this.emphasized = false});
  final String label;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      height: 48,
      child: Material(
        color: emphasized ? c.textPrimary : c.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Center(
              child: Text(label, style: context.text.labelLarge?.copyWith(color: emphasized ? c.background : c.textPrimary)),
            ),
          ),
        ),
      ),
    );
  }
}
