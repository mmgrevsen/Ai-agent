import 'dart:async';
import 'dart:math' as math;

import 'package:drift/drift.dart' show TableUpdateQuery;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../services/sync_service.dart';

class SyncState {
  const SyncState({this.enabled = false, this.running = false, this.lastSuccess, this.error, this.lastResult});
  final bool enabled;
  final bool running;
  final DateTime? lastSuccess;
  final String? error;
  final SyncResult? lastResult;

  SyncState copyWith({bool? enabled, bool? running, DateTime? lastSuccess, String? error, bool clearError = false, SyncResult? lastResult}) => SyncState(
        enabled: enabled ?? this.enabled,
        running: running ?? this.running,
        lastSuccess: lastSuccess ?? this.lastSuccess,
        error: clearError ? null : (error ?? this.error),
        lastResult: lastResult ?? this.lastResult,
      );
}

/// Runs sync while a user is signed in: once on sign-in, a few seconds after
/// local changes, and every few minutes. Failures back off exponentially;
/// local data is never lost because rows stay dirty until a push succeeds.
class SyncController extends Notifier<SyncState> {
  Timer? _debounce;
  Timer? _periodic;
  StreamSubscription<Object?>? _changes;
  int _failures = 0;

  @override
  SyncState build() {
    final backend = ref.watch(backendProvider);
    final user = ref.watch(authUserProvider).value;
    ref.onDispose(_stop);
    if (!backend.configured || user == null) return const SyncState();

    final db = ref.watch(databaseProvider);
    _changes = db.tableUpdates(TableUpdateQuery.onAllTables(db.syncedTables)).listen((_) {
      // Writes made by sync itself (clean flags, pulled rows) don't need another round.
      if (!state.running) _schedule(const Duration(seconds: 5));
    });
    _periodic = Timer.periodic(const Duration(minutes: 5), (_) => syncNow());
    Future.microtask(syncNow);
    return const SyncState(enabled: true);
  }

  void _stop() {
    _debounce?.cancel();
    _periodic?.cancel();
    _changes?.cancel();
  }

  void _schedule(Duration delay) {
    _debounce?.cancel();
    _debounce = Timer(delay, syncNow);
  }

  Future<void> syncNow() async {
    if (!state.enabled || state.running) return;
    final backend = ref.read(backendProvider);
    final user = backend.user;
    if (user == null || backend.client == null) return;
    state = state.copyWith(running: true, clearError: true);
    try {
      final prefs = await ref.read(settingsRepositoryProvider).prefs();
      final result = await SyncService(
        db: ref.read(databaseProvider),
        remote: SupabaseRemoteStore(backend.client!),
        userId: user.id,
        includeHealth: prefs.syncHealthData,
      ).sync();
      _failures = 0;
      state = state.copyWith(running: false, lastSuccess: result.at, lastResult: result);
    } catch (e) {
      _failures++;
      final wait = Duration(seconds: math.min(600, 10 * math.pow(2, _failures).toInt()));
      state = state.copyWith(running: false, error: 'Sync failed — will retry in ${wait.inSeconds}s. Your data is safe on this device.');
      _schedule(wait);
    }
  }
}

final syncControllerProvider = NotifierProvider<SyncController, SyncState>(SyncController.new);
