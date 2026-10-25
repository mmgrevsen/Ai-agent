# Status

Last updated 2026-10-24. "Verified" means exercised by an automated test or
by running the app; see *How it was verified* at the end.

## Phase summary

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Environment, architecture, design system, app shell | Done |
| 2 | Navigation, onboarding, auth, persistent preferences | Done (Apple/email sign-in needs a Supabase project) |
| 3 | Workout logging, history, templates, progression | Done |
| 4 | Nutrition diary and food databases | Done (USDA needs an API key; live food APIs not reachable from the build sandbox) |
| 5 | Weight tracking, analytics, dashboard | Done |
| 6 | Apple Health, AI coach | Code complete; HealthKit and live Claude calls need a device / API key |
| 7 | Sync, privacy, tests, hardening | Done; sync verified against a fake server and the SQL triggers/RLS on PostgreSQL 16 |

## What works

**Training.** 81-exercise library with instructions, muscles, equipment and
movement patterns; custom exercises; templates with rep ranges, RPE targets,
rest, warm-ups and supersets; weekly schedule with planned deloads; a
generated starter program filtered by equipment and restrictions; one-tap set
logging with previous-session values and suggested values shown as
placeholders (never recorded until confirmed); warm-up ramps; rest timer;
substitutions ranked by pattern/muscle; auto-saved sessions that survive app
restarts; editable history (including date/time); post-workout summary with
PRs and next-session suggestions; equipment/restriction settings; Apple
Health workout export.

**Progression engine** (`lib/domain/training/progression_engine.dart`):
baseline without history (no invented loads), double progression with RPE,
two-increment steps only after repeated easy success, hold on very high
effort or low recovery, reduce after two failed sessions, reset after a
3-session plateau, planned deloads, safety caps (% and absolute, upper vs
lower body), explanations that quote the recorded sets. 20 unit tests.

**Nutrition.** Diary by meal with calories, protein, carbs, fat and fiber;
Open Food Facts search and barcode lookup (direct, or via the server with
USDA FoodData Central); custom foods (per 100 g or per serving); recipes;
saved meals; copy meal from yesterday; quick add; water; AI photo estimates
with ranges and mandatory review. A kitchen scale visible in the photo is
read and its weight replaces the portion guess (not applied when the
reading includes the plate). Photo estimates are kept as foods (and
optionally a saved meal) so they can be logged again without a new photo.
Barcodes can be read from a still photo, and an unknown product can be
added by photographing its nutrition label (values pre-filled for review,
impossible or inconsistent values flagged). Unknown nutrients are stored as NULL and
totals that include them are flagged as lower bounds; every item shows its
source (Verified / Community / Custom / AI estimate) and plausibility
warnings.

**Body & energy.** Weigh-ins with an exponentially smoothed trend, 7/30-day
change, goal weight (blocked below BMI 18.5), measurements. Expenditure is
estimated from intake and trend (blended with Mifflin–St Jeor while data is
sparse) and labelled as an estimate with method and confidence. Targets
apply safeguards: no deficits under 18 or below BMI 18.5, ≤1 %/week loss,
≤25 % deficit, calorie floor ≥ max(BMR, 1,200–1,500 kcal). Calorie numbers,
nutrition, weight tracking and the coach can each be turned off.

**Recovery.** HealthKit categories requested one at a time with an
explanation; sleep (overlaps merged), resting HR, HRV, heart rate, steps,
active energy, weight and workouts imported idempotently. Readiness compares
today with a 28-day personal baseline (needs ≥7 days), plus check-ins and
recent training load, and lists missing data. Labelled as guidance, not a
medical measurement. Health data stays on the device unless the user opts in
to backing it up.

**AI coach.** Deterministic notes (plateaus, protein vs target, weight-trend
rate, consistency, recovery) work offline. The chat sends a minimised,
scope-filtered summary (no notes, food names or birth year) to the `coach`
Edge Function, which calls Claude (`claude-opus-5-5`, structured JSON output,
cached system prompt, server-side refusal fallback, daily quota). Replies
cite records and list data gaps. Plan/target proposals are validated on the
server, re-validated on the device against equipment, restrictions, age, BMR
and deficit limits, and applied only after the user confirms.

**Sync & privacy.** Local-first SQLite; client UUIDs; idempotent upserts;
last-write-wins enforced by a server trigger; server-clock cursors with an
overlap window; soft deletes; account switching clears the previous local
copy. RLS on every table, composite foreign keys so rows can only reference
the same owner's rows, a trigger blocking references to other users' custom
exercises, no anon access. JSON export of all data; delete local data;
delete account (cascades on the server).

**Updates without a new IPA.** Programs, exercises, progression tuning,
reference foods, coach suggestions, feature flags and announcements are a
versioned content bundle (`app/assets/content/`, `app/lib/content/`). It is
bundled for offline use, published by `.github/workflows/forma-content.yml`,
validated in full before activation, applied in one transaction (exercises
are only inserted or updated, never deleted), and the previous bundle is kept
for manual or automatic (failed start) rollback. Settings → App updates shows
versions, status and errors. Shorebird code push is prepared and switches on
when the `SHOREBIRD_TOKEN` secret is added. See [UPDATES.md](UPDATES.md).

## Needs credentials, a device or a decision

| Item | What is needed |
| --- | --- |
| Supabase project | Create a project, `supabase db push`, deploy the four functions, pass URL + publishable key via `--dart-define` |
| AI coach & photo estimates | `ANTHROPIC_API_KEY` secret on the Supabase project |
| USDA FoodData Central | Free `FDC_API_KEY` secret (Open Food Facts works without a key) |
| Sign in with Apple | Apple Developer account: Service ID + key configured in Supabase Auth (uses the web OAuth flow; the native entitlement was removed so free Apple IDs can sign the app) |
| HealthKit | Run on an iPhone (and optionally Apple Watch) with the HealthKit capability and your signing team |
| iOS build | GitHub Actions builds an unsigned `.ipa` on macOS (`.github/workflows/forma-ios-unsigned.yml`) and publishes it on the `forma-ios-latest` release; install with a free Apple ID via SideStore (weekly refresh on the phone) or Sideloadly — see [INSTALL-IPHONE.md](INSTALL-IPHONE.md) (Danish). Not yet tried on a device |
| Background rest-timer alerts | Local notifications (e.g. `flutter_local_notifications`) so the timer alerts when the app is backgrounded — not added yet |
| Regional food data | Decide on an import (below); `assets/content/foods.json` can carry it as reference foods with a cited source |
| Code push | Shorebird account + `SHOREBIRD_TOKEN` secret (steps in [UPDATES.md](UPDATES.md)); patch loading inside LiveContainer is untested |

### Regional food databases evaluated

| Database | Coverage | Access | Fit |
| --- | --- | --- | --- |
| **Frida** (DTU Fødevareinstituttet, Denmark) | ~1,300 generic foods, lab-analysed | Free download (Excel/CSV), no API | Best fit for Danish users: import into a server table and serve as *Verified* via `food-search` |
| Fineli (Finland) | ~4,000 foods | Open API and downloads (CC BY) | Good Nordic complement |
| CoFID / McCance & Widdowson (UK) | ~2,900 foods | Download | UK users |
| NEVO (Netherlands) | ~2,300 foods | Download on request | NL users |
| USDA FoodData Central | Generic + branded (US) | Free API key | Implemented |
| Open Food Facts | Global packaged foods, barcodes | Open API (ODbL) | Implemented; community data |

## Known limitations

* Two devices that both import the same Apple Health workout or weigh-in
  create two rows (different local ids). Trend math is unaffected (same-day
  weights are averaged); workout counts can double. A server-side dedupe on
  `external_id` is the planned fix.
* Exercise e1RM uses Epley adjusted for RPE; it is labelled as an estimate
  and is unreliable above ~12 effective reps (those sets are ignored).
* Widget tests can't run flows that rely on database transactions under the
  fake test clock; those journeys run in `integration_test/` instead.
* Imperial units are supported for display and entry; increments for
  imperial users default to 5/10 lb.

## How it was verified (this environment)

| Check | Result |
| --- | --- |
| `flutter analyze` | No issues |
| Unit tests: engines (`test/domain`) | 46 passed |
| Repository, sync (two simulated devices + fake RLS server), coach-proposal safety, parsers (`test/data`, `test/services`) | 28 passed |
| Widget journeys with real fonts (`test/journeys`) | 3 passed |
| End-to-end on the Linux desktop build under Xvfb (`integration_test`) | Passed: onboarding, empty + planned workout, set logging, rest timer, finish/summary/history, discard, quick add, custom food → portion → diary totals; planned workout start ≈ 1 s including test pauses |
| `supabase/tests/run.sh` on PostgreSQL 16 | Migrations apply; RLS isolation, cross-user FK/exercise blocking, LWW, server clock, idempotent upsert, quota, anon denial, cascade delete all pass |
| Edge Functions: `deno check`, `deno lint`, `deno test` | 12 passed, including the Messages API request shape against a local mock |
| Exercise seed in sync with the app library | `generate-exercise-seed.mjs --check` passes |
| Visual review | Screens rendered at iPhone size in dark and light mode (`test/screenshots`, run with `--run-skipped`) |

Not verified here: iOS build, HealthKit on a device, live Supabase, live
Claude responses, live Open Food Facts / USDA responses (the sandbox blocks
those hosts; parsers are tested with recorded shapes).
