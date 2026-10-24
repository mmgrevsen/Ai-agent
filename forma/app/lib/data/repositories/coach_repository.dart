import 'package:drift/drift.dart';

import '../db/app_database.dart';
import 'base.dart';

class CoachRepository extends Repository {
  CoachRepository(super.db);

  static const defaultThread = 'main';

  Stream<List<CoachMessage>> watchThread([String thread = defaultThread]) => (db.select(db.coachMessages)
        ..where((m) => m.threadId.equals(thread) & m.deletedAt.isNull())
        ..orderBy([(m) => OrderingTerm.asc(m.createdAt)]))
      .watch();

  Future<List<CoachMessage>> recent({String thread = defaultThread, int limit = 12}) async {
    final rows = await (db.select(db.coachMessages)
          ..where((m) => m.threadId.equals(thread) & m.deletedAt.isNull())
          ..orderBy([(m) => OrderingTerm.desc(m.createdAt)])
          ..limit(limit))
        .get();
    return rows.reversed.toList();
  }

  Future<String> addMessage({required String role, required String content, String? payload, String thread = defaultThread}) async {
    final id = newId();
    await db.into(db.coachMessages).insert(CoachMessagesCompanion.insert(
          id: Value(id),
          threadId: thread,
          role: role,
          content: content,
          payload: Value(payload),
        ));
    return id;
  }

  Future<void> clearThread([String thread = defaultThread]) =>
      (db.update(db.coachMessages)..where((m) => m.threadId.equals(thread) & m.deletedAt.isNull())).write(
        CoachMessagesCompanion(deletedAt: Value(nowUtc()), updatedAt: Repository.touched, dirty: Repository.dirty),
      );

  // ------------------------------------------------------------ recommendations

  Future<String> addRecommendation({
    required String kind,
    required String title,
    required String explanation,
    String? payload,
    String source = 'ai',
  }) async {
    final id = newId();
    await db.into(db.aiRecommendations).insert(AiRecommendationsCompanion.insert(
          id: Value(id),
          kind: kind,
          title: title,
          explanation: explanation,
          payload: Value(payload),
          source: Value(source),
        ));
    return id;
  }

  Stream<AiRecommendation?> watchRecommendation(String id) =>
      (db.select(db.aiRecommendations)..where((r) => r.id.equals(id))).watchSingleOrNull();

  Future<AiRecommendation?> recommendation(String id) =>
      (db.select(db.aiRecommendations)..where((r) => r.id.equals(id))).getSingleOrNull();

  Future<void> decide(String id, {required bool accepted}) =>
      (db.update(db.aiRecommendations)..where((r) => r.id.equals(id))).write(AiRecommendationsCompanion(
        status: Value(accepted ? 'accepted' : 'rejected'),
        decidedAt: Value(nowUtc()),
        updatedAt: Repository.touched,
        dirty: Repository.dirty,
      ));
}
