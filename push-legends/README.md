# Push Legends

A fantasy idle RPG where **real push-ups, counted by your phone camera, power your army**.
Build a deck, upgrade heroes, gear and pets, grow a base that earns while you are away, and beat
multi-phase bosses. Losing a battle never costs you anything.

- Game design, formulas and balance: [GAME_DESIGN.md](GAME_DESIGN.md)
- Current status, test results and known issues: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Plan for accounts, cloud saves, friends, leaderboards and guilds: [BACKEND_PLAN.md](BACKEND_PLAN.md)

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | One typed codebase for the game logic, UI, tests and simulations |
| UI | React 19 + Canvas 2D | DOM for menus, a canvas renderer for battles; all art is drawn procedurally (no asset files) |
| Build | Vite 8 | Fast builds; relative base so the output runs inside native WebViews |
| Mobile | Capacitor 8 (`android/`, `ios/`) | Wraps the web build as native Android/iOS apps with camera permissions |
| Pose detection | MediaPipe Pose Landmarker (lite), on-device WASM + GPU | Maintained, runs offline in mobile WebViews on both platforms |
| Tests | Vitest | Unit tests, no-loss invariant fuzzing and multi-week balance simulations |

The game logic in `src/core/` has no UI or browser dependencies, so it is fully testable and could
later run on a server for score validation.

## Run it

Requires Node.js 22+.

```bash
cd push-legends
npm install          # .npmrc enables legacy-peer-deps (a Vitest peer-dependency resolver quirk)
npm run dev          # http://localhost:5173 - also copies the MediaPipe WASM and downloads the pose model
```

Open it on a phone on the same network (`npm run dev -- --host`) or use a mobile viewport in desktop
Chrome. The camera needs HTTPS or `localhost`.

```bash
npm test             # all unit, invariant and simulation tests
npm run simulate     # prints the balance report from the progression simulator
npm run typecheck
npm run build        # production build into dist/
```

### Native apps

```bash
npm run cap:sync                 # build the web app and copy it into android/ and ios/
npx cap open android             # Android Studio (Android SDK required)
npx cap open ios                 # Xcode on macOS
```

Camera permissions are already declared (`AndroidManifest.xml`: `CAMERA`; `Info.plist`:
`NSCameraUsageDescription`). The pose model and WASM are bundled into the app, so detection works
offline.

### UI smoke test (optional)

`scripts/e2e-smoke.cjs` drives the built app with Playwright: intro, first battle, every screen,
modals, and the camera pipeline using Chromium's fake camera. Playwright is not a project dependency.

```bash
npm run build && npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node scripts/e2e-smoke.cjs e2e-shots
```

## Project layout

```
src/
  core/                 pure game logic (no DOM)
    config/balance.ts   every tunable number
    content/            cards, worlds & bosses, gear, pets, buildings, quests, cosmetics
    combat/             deterministic battle engine and wave generation
    exercise/           landmark measurement, rep state machine, calibration, synthetic poses
    systems/            economy, cards, hero, equipment, pets, buildings, idle, quests, chests,
                        shop, dungeon, battle setup, progression (no-loss finalization)
    social/             friend/deck/challenge codes, offline social service, backend interface
    state/              save types, initial state, versioned save/load with backup and repair
    sim/                headless progression simulator
  platform/             storage, synthesized audio, haptics, camera + MediaPipe
  app/                  store (state + actions) and the App shell
  ui/                   art (procedural sprites, scenery), components, screens, battle renderer
tests/                  Vitest suites
android/, ios/          Capacitor native projects
```

## Privacy

Push-up detection runs entirely on the device. Camera video is never uploaded, recorded or stored;
only the body-landmark positions of the current frame are used to count reps and then discarded.
Calibration stores two angles. Saves are local.
