import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../data/db/app_database.dart';
import '../data/repositories/exercise_repository.dart';
import 'content_bundle.dart';

/// Result of asking the server for content.
sealed class ContentFetch {
  const ContentFetch();
}

class ContentNotModified extends ContentFetch {
  const ContentNotModified();
}

class ContentDownloaded extends ContentFetch {
  const ContentDownloaded(this.json, {this.etag});
  final Object? json;
  final String? etag;
}

abstract interface class ContentTransport {
  Future<ContentFetch> fetch({String? etag});
}

class ContentFetchException implements Exception {
  const ContentFetchException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Downloads the published bundle over HTTPS. The file is public, read-only
/// content (no user data), so no credentials are involved.
class HttpContentTransport implements ContentTransport {
  HttpContentTransport(this.url, {http.Client? client}) : _client = client ?? http.Client();
  final Uri url;
  final http.Client _client;
  static const maxBytes = 5 * 1024 * 1024;

  @override
  Future<ContentFetch> fetch({String? etag}) async {
    final http.Response res;
    try {
      res = await _client
          .get(url, headers: {'Accept': 'application/json', 'If-None-Match': ?etag})
          .timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const ContentFetchException('The update server did not answer. Check your connection and try again.');
    } on Exception {
      throw const ContentFetchException('No connection to the update server. Updates will be checked again later.');
    }
    if (res.statusCode == 304) return const ContentNotModified();
    if (res.statusCode == 404) throw const ContentFetchException('No content has been published yet.');
    if (res.statusCode != 200) throw ContentFetchException('The update server returned an error (${res.statusCode}).');
    if (res.bodyBytes.length > maxBytes) throw const ContentFetchException('The update is larger than allowed and was ignored.');
    try {
      return ContentDownloaded(jsonDecode(utf8.decode(res.bodyBytes)), etag: res.headers['etag']);
    } on FormatException {
      throw const ContentFetchException('The update could not be read and was ignored.');
    }
  }
}

enum ContentSource { builtIn, downloaded }

/// What the Settings screen shows about content updates.
class ContentStatus {
  const ContentStatus({
    required this.bundle,
    required this.source,
    this.lastCheck,
    this.lastSuccess,
    this.lastError,
    this.previousVersion,
    this.checking = false,
    this.lastResult,
  });

  final ContentBundle bundle;
  final ContentSource source;
  final DateTime? lastCheck;
  final DateTime? lastSuccess;
  final String? lastError;
  final int? previousVersion;
  final bool checking;
  final CheckResult? lastResult;

  ContentStatus copyWith({ContentBundle? bundle, ContentSource? source, DateTime? lastCheck, DateTime? lastSuccess, String? lastError, bool clearError = false, int? previousVersion, bool? checking, CheckResult? lastResult}) =>
      ContentStatus(
        bundle: bundle ?? this.bundle,
        source: source ?? this.source,
        lastCheck: lastCheck ?? this.lastCheck,
        lastSuccess: lastSuccess ?? this.lastSuccess,
        lastError: clearError ? null : (lastError ?? this.lastError),
        previousVersion: previousVersion ?? this.previousVersion,
        checking: checking ?? this.checking,
        lastResult: lastResult ?? this.lastResult,
      );
}

enum CheckOutcome { updated, upToDate, needsNewerApp, rejected, failed }

class CheckResult {
  const CheckResult(this.outcome, {this.version, this.message});
  final CheckOutcome outcome;
  final int? version;
  final String? message;
}

/// Keeps the app's server-updatable content current.
///
/// * The built-in bundle (from the app's assets) is always available, so the
///   app works offline from the first launch.
/// * A downloaded bundle is validated in full (structure, ranges, checksum,
///   minimum app build) before anything is stored; a rejected download never
///   replaces working content.
/// * Activation is one database transaction: the exercise library is updated
///   (insert or update only — nothing a workout references is ever deleted)
///   and the previous bundle is kept for rollback.
/// * If the app fails to start twice with new content, it reverts to the
///   previous content automatically.
class ContentService {
  ContentService({
    required this.db,
    required this.builtIn,
    required this.transport,
    required this.appBuild,
    DateTime Function()? clock,
  }) : _now = clock ?? DateTime.now;

  final AppDatabase db;
  final ContentBundle builtIn;
  final ContentTransport? transport;

  /// Build number of the installed app (0 for local development builds).
  final int appBuild;
  final DateTime Function() _now;

  static const kActive = 'content.active';
  static const kPrevious = 'content.previous';
  static const kApplied = 'content.applied_version';
  static const kEtag = 'content.etag';
  static const kLastCheck = 'content.last_check';
  static const kLastSuccess = 'content.last_success';
  static const kLastError = 'content.last_error';
  static const kBootPending = 'content.boot_pending';
  static const kBootFailures = 'content.boot_failures';
  static const kRejected = 'content.rejected_version';

  /// Failed starts with the same new content before it is rolled back.
  static const maxBootFailures = 2;

  late ContentStatus _status;
  ContentStatus get status => _status;
  final _changes = StreamController<ContentStatus>.broadcast();
  Stream<ContentStatus> get changes => _changes.stream;
  Future<CheckResult>? _inFlight;

  void _emit(ContentStatus s) {
    _status = s;
    if (!_changes.isClosed) _changes.add(s);
  }

  Future<ContentBundle?> _readStored(String key) async {
    final raw = await db.readMeta(key);
    if (raw == null) return null;
    try {
      return ContentBundle.parse(jsonDecode(raw));
    } on Object {
      return null; // Unreadable stored content is ignored, never applied.
    }
  }

  bool _usable(ContentBundle b) => b.minAppBuild <= appBuild || appBuild == 0;

  DateTime? _time(String? v) => v == null ? null : DateTime.tryParse(v)?.toLocal();

  /// Loads the active content. Call once at startup, before the UI.
  Future<void> init() async {
    var stored = await _readStored(kActive);
    if (stored != null && !_usable(stored)) stored = null;

    // Crash guard: the last start with this content never completed.
    if (stored != null && await db.readMeta(kBootPending) == '${stored.version}') {
      final failures = (int.tryParse(await db.readMeta(kBootFailures) ?? '') ?? 0) + 1;
      await db.writeMeta(kBootFailures, '$failures');
      if (failures >= maxBootFailures) {
        await db.writeMeta(kRejected, '${stored.version}');
        await db.writeMeta(kLastError, 'Content ${stored.version} stopped the app from starting and was rolled back.');
        stored = await _rollBackStored();
      }
    }

    final active = stored != null && stored.version > builtIn.version ? stored : builtIn;
    if (await db.readMeta(kApplied) != '${active.version}') await _applyToDatabase(active);
    if (identical(active, stored)) await db.writeMeta(kBootPending, '${active.version}');

    final previous = await _readStored(kPrevious);
    _status = ContentStatus(
      bundle: active,
      source: identical(active, builtIn) ? ContentSource.builtIn : ContentSource.downloaded,
      lastCheck: _time(await db.readMeta(kLastCheck)),
      lastSuccess: _time(await db.readMeta(kLastSuccess)),
      lastError: await db.readMeta(kLastError),
      previousVersion: previous?.version,
    );
  }

  /// Call after the first frame renders: the active content is known-good.
  Future<void> markBootSucceeded() async {
    await db.deleteMeta(kBootPending);
    await db.deleteMeta(kBootFailures);
  }

  Future<ContentBundle?> _rollBackStored() async {
    final previous = await _readStored(kPrevious);
    await db.transaction(() async {
      if (previous != null) {
        await db.writeMeta(kActive, jsonEncode(previous.toJson()));
      } else {
        await db.deleteMeta(kActive);
      }
      await db.deleteMeta(kPrevious);
      await db.deleteMeta(kBootPending);
      await db.deleteMeta(kBootFailures);
    });
    return previous;
  }

  /// Inserts or updates the exercise library from [bundle]. Exercises that
  /// disappear from the content are kept: past workouts reference them.
  Future<void> _applyToDatabase(ContentBundle bundle) => db.transaction(() async {
        await ExerciseRepository(db).upsertLibrary(bundle.exercises);
        await db.writeMeta(kApplied, '${bundle.version}');
      });

  /// Checks the server and activates newer, valid content. Concurrent calls
  /// share one request.
  Future<CheckResult> check() => _inFlight ??= _check().whenComplete(() => _inFlight = null);

  Future<CheckResult> _check() async {
    final t = transport;
    if (t == null) return const CheckResult(CheckOutcome.failed, message: 'Content updates are not configured in this build.');
    _emit(_status.copyWith(checking: true));
    final now = _now();
    await db.writeMeta(kLastCheck, now.toUtc().toIso8601String());
    CheckResult result;
    try {
      final fetched = await t.fetch(etag: await db.readMeta(kEtag));
      result = switch (fetched) {
        ContentNotModified() => CheckResult(CheckOutcome.upToDate, version: _status.bundle.version),
        ContentDownloaded(:final json, :final etag) => await _consider(json, etag),
      };
    } on ContentFetchException catch (e) {
      result = CheckResult(CheckOutcome.failed, message: e.message);
    }

    final ok = result.outcome == CheckOutcome.updated || result.outcome == CheckOutcome.upToDate;
    if (ok) {
      await db.writeMeta(kLastSuccess, now.toUtc().toIso8601String());
      await db.deleteMeta(kLastError);
    } else if (result.message != null) {
      await db.writeMeta(kLastError, result.message!);
    }
    _emit(_status.copyWith(
      checking: false,
      lastCheck: now,
      lastSuccess: ok ? now : null,
      lastError: ok ? null : result.message,
      clearError: ok,
      lastResult: result,
    ));
    return result;
  }

  Future<CheckResult> _consider(Object? json, String? etag) async {
    final ContentBundle incoming;
    try {
      incoming = ContentBundle.parse(json);
    } on ContentValidationException catch (e) {
      // Keep the working content; report the first problem.
      return CheckResult(CheckOutcome.rejected, message: 'The new content failed validation and was not installed (${e.errors.first}).');
    }
    if (!_usable(incoming)) {
      return CheckResult(CheckOutcome.needsNewerApp, version: incoming.version, message: 'New content is available but needs a newer app build (${incoming.minAppBuild} or later).');
    }
    if (await db.readMeta(kRejected) == '${incoming.version}') {
      return CheckResult(CheckOutcome.rejected, version: incoming.version, message: 'Content ${incoming.version} was rolled back earlier and will be skipped.');
    }
    if (incoming.version <= _status.bundle.version) {
      if (etag != null) await db.writeMeta(kEtag, etag);
      return CheckResult(CheckOutcome.upToDate, version: _status.bundle.version);
    }
    try {
      await activate(incoming);
    } on Object catch (e) {
      // The transaction rolled back; the previous content is still active.
      return CheckResult(CheckOutcome.failed, version: incoming.version, message: 'The new content could not be installed and the current content was kept ($e).');
    }
    if (etag != null) await db.writeMeta(kEtag, etag);
    return CheckResult(CheckOutcome.updated, version: incoming.version);
  }

  /// Makes [bundle] the active content, keeping the current one as the
  /// rollback point. All-or-nothing.
  Future<void> activate(ContentBundle bundle) async {
    final current = _status.source == ContentSource.downloaded ? _status.bundle : null;
    await db.transaction(() async {
      await _applyToDatabase(bundle);
      if (current != null) await db.writeMeta(kPrevious, jsonEncode(current.toJson()));
      await db.writeMeta(kActive, jsonEncode(bundle.toJson()));
      // The next start is the first with this content.
      await db.writeMeta(kBootPending, '${bundle.version}');
      await db.deleteMeta(kBootFailures);
    });
    _emit(_status.copyWith(bundle: bundle, source: ContentSource.downloaded, previousVersion: current?.version));
  }

  /// Goes back to the previous content (or the built-in content).
  Future<void> rollBack() async {
    final rejected = _status.source == ContentSource.downloaded ? _status.bundle.version : null;
    final previous = await _rollBackStored();
    if (rejected != null) await db.writeMeta(kRejected, '$rejected');
    final active = previous != null && previous.version > builtIn.version ? previous : builtIn;
    await _applyToDatabase(active);
    _emit(ContentStatus(
      bundle: active,
      source: identical(active, builtIn) ? ContentSource.builtIn : ContentSource.downloaded,
      lastCheck: _status.lastCheck,
      lastSuccess: _status.lastSuccess,
      lastError: _status.lastError,
    ));
  }

  Future<void> dispose() => _changes.close();
}
