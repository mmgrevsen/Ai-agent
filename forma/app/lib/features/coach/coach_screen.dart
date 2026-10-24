import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/primitives.dart';
import '../../core/widgets/states.dart';
import '../../data/db/app_database.dart';
import '../../data/remote/backend.dart';
import '../../services/insights_service.dart';
import '../health/health_providers.dart';
import 'coach_providers.dart';

const _suggestions = [
  'Why has my progress stalled?',
  'What should my next workout be?',
  'How is my protein intake this week?',
  'Build me a 3-day plan for my equipment',
  'Summarise my last month',
];

class CoachScreen extends ConsumerStatefulWidget {
  const CoachScreen({super.key});

  @override
  ConsumerState<CoachScreen> createState() => _CoachScreenState();
}

class _CoachScreenState extends ConsumerState<CoachScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send([String? text]) async {
    final message = (text ?? _input.text).trim();
    if (message.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    _input.clear();
    try {
      await ref.read(coachServiceProvider).ask(
            message: message,
            today: ref.read(todayProvider),
            allowed: ref.read(coachScopesProvider),
            recovery: ref.read(recoveryStatusProvider).value,
          );
    } on BackendException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = describeError(e));
    } finally {
      if (mounted) setState(() => _sending = false);
      await Future<void>.delayed(const Duration(milliseconds: 100));
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: Motion.medium, curve: Motion.standard);
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider).value;
    final backend = ref.watch(backendProvider);
    ref.watch(authUserProvider);
    final thread = ref.watch(coachThreadProvider);
    final insights = ref.watch(insightsProvider);
    final c = context.colors;
    final chatAvailable = (prefs?.coachEnabled ?? true) && backend.signedIn;

    return Scaffold(
      body: Column(children: [
        Expanded(
          child: CustomScrollView(controller: _scroll, slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(Space.gutter, MediaQuery.paddingOf(context).top + Space.md, Space.md, Space.xs),
                child: Row(children: [
                  Expanded(child: Text('Coach', style: context.text.headlineLarge)),
                  IconButton(tooltip: 'What the coach can see', onPressed: () => context.push('/settings/coach'), icon: const Icon(Icons.visibility_outlined)),
                  if ((thread.value ?? const []).isNotEmpty)
                    IconButton(tooltip: 'Clear conversation', onPressed: () => ref.read(coachRepositoryProvider).clearThread(), icon: const Icon(Icons.delete_sweep_outlined)),
                ]),
              ),
            ),
            const SliverToBoxAdapter(child: SectionHeader('Notes from your data')),
            SliverToBoxAdapter(
              child: AsyncView(
                value: insights,
                compact: true,
                data: (list) => list.isEmpty
                    ? const EmptyState(
                        icon: Icons.insights_rounded,
                        title: 'Nothing to flag yet',
                        message: 'As you log workouts, food and weight, observations based on your own records appear here.',
                        compact: true,
                      )
                    : Column(children: [for (final i in list.take(4)) _InsightTile(insight: i)]),
              ),
            ),
            const SliverToBoxAdapter(child: SectionHeader('Ask the coach')),
            if (!chatAvailable)
              SliverToBoxAdapter(
                child: EmptyState(
                  icon: Icons.auto_awesome_outlined,
                  title: !(prefs?.coachEnabled ?? true)
                      ? 'AI coach is turned off'
                      : backend.configured
                          ? 'Sign in to chat with the coach'
                          : 'The AI coach needs the Forma server',
                  message: !(prefs?.coachEnabled ?? true)
                      ? 'Turn it on in Settings if you want to ask questions about your data.'
                      : 'The coach runs on the server so no AI keys live in the app. Your notes above work offline.',
                  actionLabel: !(prefs?.coachEnabled ?? true) ? 'Settings' : (backend.configured ? 'Sign in' : null),
                  onAction: !(prefs?.coachEnabled ?? true)
                      ? () => context.push('/settings/features')
                      : (backend.configured ? () => context.push('/settings/account') : null),
                  compact: true,
                ),
              )
            else
              ...thread.when(
                loading: () => [const SliverToBoxAdapter(child: LoadingState(compact: true))],
                error: (e, _) => [SliverToBoxAdapter(child: ErrorState(message: describeError(e), compact: true))],
                data: (messages) => [
                  if (messages.isEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                      sliver: SliverToBoxAdapter(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(
                            'Ask about your own training, nutrition and progress. Answers are based on your records; '
                            'plan changes are only saved after you review and confirm them.',
                            style: context.text.bodyMedium,
                          ),
                          const SizedBox(height: Space.md),
                          Wrap(spacing: Space.sm, runSpacing: Space.sm, children: [
                            for (final s in _suggestions) ActionChip(label: Text(s), onPressed: () => _send(s)),
                          ]),
                        ]),
                      ),
                    ),
                  SliverList.builder(itemCount: messages.length, itemBuilder: (context, i) => _MessageBubble(message: messages[i])),
                  if (_sending)
                    const SliverToBoxAdapter(
                      child: Padding(padding: EdgeInsets.all(Space.lg), child: Text('Looking at your data…')),
                    ),
                  if (_error != null)
                    SliverToBoxAdapter(
                      child: Padding(padding: const EdgeInsets.all(Space.gutter), child: Text(_error!, style: context.text.bodyMedium?.copyWith(color: c.caution))),
                    ),
                  const SliverToBoxAdapter(child: SizedBox(height: Space.xl)),
                ],
              ),
          ]),
        ),
        if (chatAvailable)
          Container(
            decoration: BoxDecoration(color: c.background, border: Border(top: BorderSide(color: c.outline))),
            padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.sm, Space.sm),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(hintText: 'Ask about your data…'),
                ),
              ),
              const SizedBox(width: Space.sm),
              IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.arrow_upward_rounded), tooltip: 'Send'),
            ]),
          ),
      ]),
    );
  }
}

class _InsightTile extends StatelessWidget {
  const _InsightTile({required this.insight});
  final Insight insight;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = switch (insight.tone) {
      InsightTone.positive => c.positive,
      InsightTone.attention => c.caution,
      InsightTone.neutral => c.textSecondary,
    };
    return ListTile(
      leading: Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 6), decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      minLeadingWidth: 8,
      title: Text(insight.title),
      subtitle: Text(insight.body),
      trailing: insight.route == null ? null : const Icon(Icons.chevron_right_rounded),
      onTap: insight.route == null ? null : () => context.go(insight.route!),
    );
  }
}

class _MessageBubble extends ConsumerWidget {
  const _MessageBubble({required this.message});
  final CoachMessage message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final user = message.role == 'user';
    Map<String, dynamic> payload = const {};
    if (message.payload != null) {
      try {
        payload = jsonDecode(message.payload!) as Map<String, dynamic>;
      } on Object {
        payload = const {};
      }
    }
    final citations = (payload['citations'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    final gaps = (payload['dataGaps'] as List<dynamic>? ?? const []).cast<String>();
    final proposals = (payload['proposals'] as List<dynamic>? ?? const []).cast<String>();

    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.fromLTRB(user ? 56 : Space.gutter, Space.xs, user ? Space.gutter : 40, Space.xs),
        padding: const EdgeInsets.all(Space.md),
        decoration: BoxDecoration(
          color: user ? c.surfaceRaised : c.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: c.outline),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SelectableText(message.content, style: context.text.bodyLarge),
          if (citations.isNotEmpty) ...[
            const SizedBox(height: Space.sm),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final cit in citations)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(Radii.pill), border: Border.all(color: c.outline)),
                  child: Text('Based on: ${cit['label']}', style: context.text.labelSmall?.copyWith(letterSpacing: 0)),
                ),
            ]),
          ],
          if (gaps.isNotEmpty) ...[
            const SizedBox(height: Space.sm),
            Text('Missing data: ${gaps.join('; ')}', style: context.text.bodySmall?.copyWith(color: c.caution)),
          ],
          for (final id in proposals) _ProposalCard(id: id),
        ]),
      ),
    );
  }
}

final _recommendationProvider = StreamProvider.family((ref, String id) => ref.watch(coachRepositoryProvider).watchRecommendation(id));

class _ProposalCard extends ConsumerWidget {
  const _ProposalCard({required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rec = ref.watch(_recommendationProvider(id)).value;
    if (rec == null) return const SizedBox.shrink();
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(top: Space.md),
      child: FCard(
        color: c.surfaceRaised,
        padding: const EdgeInsets.all(Space.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const ProvenanceBadge(Provenance.aiEstimate, compact: true),
            const SizedBox(width: Space.sm),
            Expanded(child: Text(rec.title, style: context.text.titleSmall)),
          ]),
          if (rec.explanation.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(rec.explanation, style: context.text.bodySmall)),
          const SizedBox(height: Space.sm),
          switch (rec.status) {
            'accepted' => Text('Applied', style: context.text.labelMedium?.copyWith(color: c.positive)),
            'rejected' => Text('Dismissed', style: context.text.labelMedium),
            _ => Row(children: [
                TextButton(onPressed: () => ref.read(coachRepositoryProvider).decide(rec.id, accepted: false), child: const Text('Dismiss')),
                const Spacer(),
                FilledButton(onPressed: () => _review(context, ref, rec), child: const Text('Review')),
              ]),
          },
        ]),
      ),
    );
  }

  Future<void> _review(BuildContext context, WidgetRef ref, AiRecommendation rec) async {
    final service = ref.read(coachServiceProvider);
    final today = ref.read(todayProvider);
    final check = await service.check(rec, today: today);
    if (!context.mounted) return;
    final apply = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, Space.xl),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(rec.title, style: c.text.titleLarge),
          const SizedBox(height: Space.sm),
          Text('This will change:', style: c.text.labelMedium),
          const SizedBox(height: Space.xs),
          for (final s in check.summary) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('• $s', style: c.text.bodyLarge)),
          if (!check.ok) ...[
            const SizedBox(height: Space.md),
            Text('Forma blocked this proposal:', style: c.text.titleSmall?.copyWith(color: c.colors.negative)),
            for (final p in check.problems) Text('• $p', style: c.text.bodyMedium),
          ],
          const SizedBox(height: Space.xl),
          Row(children: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            const Spacer(),
            FilledButton(onPressed: check.ok ? () => Navigator.pop(c, true) : null, child: const Text('Apply')),
          ]),
        ]),
      ),
    );
    if (apply != true) return;
    final result = await service.apply(rec, today: today);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.ok ? 'Applied.' : 'Not applied: ${result.problems.join(' ')}')));
    }
  }
}
