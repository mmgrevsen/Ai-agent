import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:shorebird_code_push/shorebird_code_push.dart';

import '../../content/content_providers.dart';
import '../../content/content_service.dart';
import '../../core/config/env.dart';
import '../../core/theme/tokens.dart';
import '../../core/util/format.dart';
import '../../core/widgets/primitives.dart';

/// Code updates (Shorebird patches), behind an interface for tests.
abstract interface class CodeUpdates {
  bool get available;
  Future<int?> currentPatch();
  Future<UpdateStatus> check();
  Future<void> download();
}

class ShorebirdCodeUpdates implements CodeUpdates {
  ShorebirdCodeUpdates() : _updater = ShorebirdUpdater();
  final ShorebirdUpdater _updater;

  @override
  bool get available => _updater.isAvailable;

  @override
  Future<int?> currentPatch() async => (await _updater.readCurrentPatch())?.number;

  @override
  Future<UpdateStatus> check() => _updater.checkForUpdate();

  @override
  Future<void> download() => _updater.update();
}

final codeUpdatesProvider = Provider<CodeUpdates>((ref) => ShorebirdCodeUpdates());

/// "yyyymmddHHMM" content versions read as a publish time; 0 is built-in.
String contentVersionLabel(int version) {
  final s = '$version';
  if (version == 0 || s.length != 12) return version == 0 ? 'Built into the app' : '#$version';
  final t = DateTime.tryParse('${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}T${s.substring(8, 10)}:${s.substring(10, 12)}:00Z');
  return t == null ? '#$version' : 'Published ${DateFormat('d MMM y, HH:mm').format(t.toLocal())}';
}

String _when(DateTime? t) => t == null ? 'Never' : '${relativeDay(t)} ${DateFormat.Hm().format(t)}';

class AppUpdatesPage extends ConsumerStatefulWidget {
  const AppUpdatesPage({super.key});

  @override
  ConsumerState<AppUpdatesPage> createState() => _AppUpdatesPageState();
}

class _AppUpdatesPageState extends ConsumerState<AppUpdatesPage> {
  int? _patch;
  String? _codeMessage;
  bool _codeBusy = false;

  @override
  void initState() {
    super.initState();
    final code = ref.read(codeUpdatesProvider);
    if (code.available) {
      code.currentPatch().then((p) {
        if (mounted) setState(() => _patch = p);
      }, onError: (Object _) {});
    }
  }

  Future<void> _checkCode() async {
    final code = ref.read(codeUpdatesProvider);
    setState(() {
      _codeBusy = true;
      _codeMessage = null;
    });
    try {
      var status = await code.check();
      if (status == UpdateStatus.outdated) {
        await code.download();
        status = UpdateStatus.restartRequired;
      }
      _codeMessage = switch (status) {
        UpdateStatus.upToDate => 'The app code is up to date.',
        UpdateStatus.restartRequired => 'A code update was downloaded. Close the app completely and open it again to use it.',
        UpdateStatus.outdated => 'A code update is available.',
        UpdateStatus.unavailable => 'Code updates are not available in this build.',
      };
    } on Exception catch (e) {
      _codeMessage = 'The code update failed: $e';
    } finally {
      if (mounted) setState(() => _codeBusy = false);
    }
  }

  Future<void> _rollBack(ContentService service) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Go back to the previous content?'),
        content: const Text('Programs, exercises and settings from the server return to the previous version. Your workouts, food log and other data are not touched.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Go back')),
        ],
      ),
    );
    if (ok == true) await service.rollBack();
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.watch(contentServiceProvider);
    final status = ref.watch(contentStatusProvider).value ?? service.status;
    final code = ref.watch(codeUpdatesProvider);
    final c = context.colors;
    final result = status.lastResult;
    final error = status.lastError;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionHeader('Installed app', padding: EdgeInsets.only(bottom: Space.sm)),
        FCard(
          child: Column(children: [
            const _Row('App build', Env.appBuild == 0 ? 'Development build' : 'Build ${Env.appBuild}'),
            _Row('Code version', code.available ? (_patch == null ? 'Original release' : 'Patch $_patch') : 'Code updates not enabled'),
            if (code.available) ...[
              const SizedBox(height: Space.sm),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(onPressed: _codeBusy ? null : _checkCode, child: Text(_codeBusy ? 'Checking…' : 'Check for code update')),
              ),
            ],
            if (_codeMessage != null) Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text(_codeMessage!, style: context.text.bodySmall)),
          ]),
        ),
        const SizedBox(height: Space.lg),
        const SectionHeader('Content', padding: EdgeInsets.only(bottom: Space.sm)),
        FCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _Row('Content version', contentVersionLabel(status.bundle.version)),
            _Row('Source', status.source == ContentSource.builtIn ? 'Built into the app' : 'Downloaded update'),
            _Row('Last checked', _when(status.lastCheck)),
            _Row('Last successful update check', _when(status.lastSuccess)),
            if (status.bundle.notes != null && status.source == ContentSource.downloaded) _Row('Notes', status.bundle.notes!),
            const SizedBox(height: Space.sm),
            if (status.checking)
              Row(children: [
                const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                const SizedBox(width: Space.sm),
                Text('Checking for updates…', style: context.text.bodySmall),
              ])
            else if (result != null && result.outcome == CheckOutcome.updated)
              Text('Updated to the newest content.', style: context.text.bodySmall?.copyWith(color: c.positive))
            else if (result != null && result.outcome == CheckOutcome.upToDate)
              Text('You have the newest content.', style: context.text.bodySmall?.copyWith(color: c.positive))
            else if (error != null)
              Text(error, style: context.text.bodySmall?.copyWith(color: c.caution)),
            const SizedBox(height: Space.md),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: status.checking || service.transport == null ? null : service.check,
                child: const Text('Check for updates'),
              ),
            ),
            if (service.transport == null)
              Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text('Content updates are not configured in this build.', style: context.text.bodySmall)),
            if (status.source == ContentSource.downloaded)
              Padding(
                padding: const EdgeInsets.only(top: Space.sm),
                child: SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: status.checking ? null : () => _rollBack(service),
                    child: Text(status.previousVersion == null ? 'Use the built-in content' : 'Go back to the previous content'),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: Space.md),
        Text(
          'Content updates change programs, exercises, reference foods, coach suggestions and server settings. '
          'They are checked automatically when the app opens and every 30 minutes, validated before use, and never change your logged data.',
          style: context.text.bodySmall,
        ),
        const SizedBox(height: Space.xl),
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.xs),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(label, style: context.text.bodyMedium?.copyWith(color: context.colors.textSecondary))),
          const SizedBox(width: Space.md),
          Flexible(child: Text(value, textAlign: TextAlign.end, style: context.text.bodyMedium)),
        ]),
      );
}
