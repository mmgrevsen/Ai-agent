# Forma — architecture

Forma is an all-in-one training, nutrition and recovery app. This document is
the implementation plan and the reference for how the pieces fit together.

## Environment (inspected 2026-10-24)

| Item | Version / state |
| --- | --- |
| Flutter | 3.47.8 stable (Dart 3.13.7) |
| Host | Linux container — no Xcode, so iOS builds/HealthKit need a Mac + device |
| Local verification | `flutter analyze`, `flutter test`, Linux desktop build under Xvfb |
| PostgreSQL | 16 (used to test migrations + RLS locally) |
| Supabase CLI | not installed; migrations are plain SQL and run with `psql` |
| Existing repo content | Unrelated Node.js project at the repo root — left untouched; Forma lives in `forma/` |

Package versions were resolved with `flutter pub add` against this SDK
(see `app/pubspec.yaml` / `pubspec.lock`).

## Layout

```
forma/
  app/                 Flutter app (iOS first, Android-ready; Linux used for local verification only)
    lib/
      core/            theme tokens, component library, formatting, config, errors
      data/            drift database, repositories, remote clients, sync
      domain/          pure Dart engines: progression, e1RM, weight trend,
                       energy expenditure, recovery, analytics (unit tested)
      features/        UI per tab / flow (overview, workout, nutrition, progress, coach, settings, onboarding)
    assets/            exercise library (single source of truth)
    test/              unit, widget and journey tests (headless)
    integration_test/  on-device journeys
  supabase/
    migrations/        schema, indexes, RLS, triggers, exercise seed
    functions/         Edge Functions (Deno): coach, food-search, food-photo, delete-account
    tests/             SQL tests for RLS / sync semantics
  docs/                architecture, status, data sources
```

## Key decisions

**Local-first.** Every write goes to an on-device SQLite database (drift) first.
The app is fully usable offline and without an account. When the user signs in,
`SyncService` pushes dirty rows and pulls remote changes.

* Client-generated UUID primary keys → upserts are idempotent, so retries and
  duplicate deliveries cannot create duplicate rows.
* `updated_at` (client clock) decides conflicts — last write wins — enforced on
  the server by a trigger that ignores stale updates.
* `server_updated_at` (server clock, set by trigger) is the pull cursor, so
  client clock skew cannot make the client miss changes. The first page of
  each pull re-reads a two-minute overlap to catch transactions that commit
  late; re-applying a row is idempotent.
* Deletes are soft (`deleted_at`) so they propagate.

**Supabase.** Auth, Postgres with row-level security on every user table
(`user_id = auth.uid()`), and Edge Functions as the only place secrets live
(Anthropic key, USDA FoodData Central key, service-role key for account
deletion). The client only ever holds the public anon key.

**State management.** Riverpod 3. Repositories expose drift `watch` streams,
surfaced as `StreamProvider`s; mutable flows (active workout, onboarding) are
`Notifier`s. Widgets never touch SQL or HTTP directly.

**Deterministic engines before AI.** Progression, weight trend, energy
expenditure, recovery and analytics are pure Dart with unit tests. The AI coach
explains and proposes; it never writes data without validation and user
confirmation, and plan proposals are re-checked against the same safety limits
as the progression engine.

**Data provenance.** Every number shown carries a source: *Recorded* (user
logged), *Imported* (Apple Health), *Calculated* (derived by an engine),
*Estimated* (formula or incomplete data), *AI estimate*. Food items carry
*Verified* (lab databases such as USDA), *Community* (Open Food Facts),
*Custom* (user), *AI estimate* (photo). Missing nutrients are stored as `NULL`,
never `0`, and totals that include missing values are flagged incomplete.

## Data model (local and remote mirror each other)

| Area | Tables |
| --- | --- |
| User | `profiles`, `user_preferences`, `user_equipment`, `exercise_restrictions`, `goals`, `nutrition_targets` |
| Training | `exercises` (global seed + custom), `workout_templates`, `template_exercises`, `training_schedules`, `schedule_days`, `workouts`, `workout_exercises`, `workout_sets`, `readiness_checkins` |
| Nutrition | `foods`, `food_servings`, `recipes`, `recipe_ingredients`, `saved_meals`, `saved_meal_items`, `nutrition_entries`, `water_entries` |
| Body | `body_weights`, `body_measurements` |
| Health | `health_observations` |
| AI | `ai_recommendations`, `coach_messages`, `ai_usage` (server only) |

Personal records and strength trends are computed from sets rather than stored,
so editing a past session can never leave a stale PR behind.

## Phases

1. Environment, architecture, design system, app shell.
2. Navigation, onboarding, authentication, persistent preferences.
3. Workout logging, history, templates, progression engine.
4. Nutrition diary and food database integration.
5. Weight tracking, adaptive expenditure, analytics, dashboard.
6. Apple Health integration and AI coach.
7. Sync, privacy controls (export / delete), tests, hardening.

Progress per phase is tracked in [STATUS.md](STATUS.md).
