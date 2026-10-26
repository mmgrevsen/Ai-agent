# Forma

An all-in-one training, nutrition and recovery app: workout logging with a
deterministic progressive-overload engine, a food diary backed by Open Food
Facts and USDA data, a smoothed weight trend with adaptive energy estimates,
Apple Health recovery insights, and an AI coach grounded in your own records.

```
forma/
  app/        Flutter app (iOS first; Android-ready)
  supabase/   Postgres schema + RLS, Edge Functions (AI coach, food search, photo estimates, account deletion), tests
  docs/       Architecture and status
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and
[docs/STATUS.md](docs/STATUS.md) for what is done and what still needs
credentials or a device.

## Run the app

Requirements: Flutter 3.47 (Dart 3.13). iOS builds need macOS with Xcode 26+.

No Mac? GitHub Actions builds an unsigned `.ipa` you can sideload with a free
Apple ID — see [docs/INSTALL-IPHONE.md](docs/INSTALL-IPHONE.md). Content and code
updates without a new IPA: [docs/UPDATES.md](docs/UPDATES.md).

```bash
cd forma/app
flutter pub get
flutter run                     # local-only mode: no account, no server needed
```

Everything except the account, sync, AI coach and AI photo estimates works
offline without any configuration. Food and nutrition-label photos are
recognised on the device (iPhone and Mac) without a server.

### With a Supabase backend

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://<project>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

Only the public client key goes into the app. Never put the service-role key
or any AI/food API key in `--dart-define`.

### Apple Health (iOS)

The iOS project already contains the usage descriptions and the HealthKit
entitlement. In Xcode, select your team under *Signing & Capabilities* for
the Runner target; HealthKit requires a real device (the simulator has no
sensor data).

## Set up Supabase

```bash
supabase link --project-ref <project>
supabase db push                                  # applies supabase/migrations
supabase secrets set ANTHROPIC_API_KEY=...        # AI coach + photo estimates
supabase secrets set FDC_API_KEY=...              # optional: USDA FoodData Central (free key at api.data.gov)
supabase secrets set OFF_USER_AGENT="Forma/1.0 (you@example.com)"
supabase functions deploy coach food-photo food-search delete-account
```

Optional secrets: `AI_MODEL` (default `claude-opus-5-5`), `COACH_DAILY_LIMIT`
(default 60), `PHOTO_DAILY_LIMIT` (default 30). Enable *Sign in with Apple*
in the Supabase dashboard (Authentication → Providers) and add the
`app.forma://login-callback` redirect URL.

## Tests and checks

```bash
cd forma/app
flutter analyze
flutter test                                       # unit, repository, sync, coach and UI journey tests
xvfb-run flutter test integration_test -d linux    # end-to-end on the Linux desktop build (or -d <iphone>)

cd ../supabase
tests/run.sh                                       # migrations + RLS/ownership/sync tests on a throwaway PostgreSQL
cd functions && deno test --allow-env --allow-net=127.0.0.1 _shared/
node ../scripts/generate-exercise-seed.mjs --check # library seed matches app/assets/exercises.json
```

## Data sources

| Source | Used for | Notes |
| --- | --- | --- |
| Open Food Facts | Packaged foods, barcodes | Community data (ODbL). Shown as *Community*; values can be wrong or missing. |
| USDA FoodData Central | Generic foods | Foundation / SR Legacy laboratory data. Shown as *Verified*. Needs a free API key (server side). |
| Your own entries | Custom foods, recipes | Shown as *Custom*. |
| AI photo estimate | Meal photos | Shown as *AI estimate* with ranges; always reviewed before logging. |

Regional options evaluated for a future import (see docs/STATUS.md): Frida
(Denmark, DTU Food), Fineli (Finland), CoFID (UK) and NEVO (Netherlands).
