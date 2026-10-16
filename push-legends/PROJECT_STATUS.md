# Push Legends - Project Status

Last updated: 2026-10-16

## Phase summary

| Phase | Status |
| --- | --- |
| 1. Inspect and plan | Done. The repository contained an unrelated Node project (a Danish AI receptionist); Push Legends lives in its own folder `push-legends/` and does not touch it. No Flutter/Android SDK in the environment, so the stack is TypeScript + React + Vite wrapped with Capacitor, with MediaPipe for on-device pose detection. |
| 2. Playable foundation | Done: navigation, home/world map, battle loop, automatic combat, card hand and valor, simulated reps (developer mode), gold and upgrades, card collection and deck, save/load, no-loss victory/defeat handling. |
| 3. Exercise engine | Done: MediaPipe Pose Landmarker integration, camera permission and privacy explanation, placement guidance, live skeleton preview, confidence indicator, calibration, rep state machine, full and knee modes, connection to combat and rewards. Developer simulation mode kept. |
| 4. Progression | Done: gear (6 slots, 25 items), card upgrades, 5 pets, 9 buildings with timers, idle War Chest and gold mine, offline report with clock protection, 5 worlds × 10 stages, 10 bosses with phases, daily/weekly quests, 12 tiered achievements, streaks with rest tokens, chests with displayed odds, shop. |
| 5. Social foundation | Done (offline parts): friend codes, local contacts, blocking, privacy setting, deck codes, fair asynchronous Friend Challenges with shareable codes, personal bests. Online features are labelled "Planned"; see BACKEND_PLAN.md. |
| 6. Polish and verify | In progress: balance tuned with the simulator; UI checked in headless Chromium at phone size; reduced motion / large text / haptics / volume settings. Not yet tested on physical devices. |

## Latest change (2026-10-16)

Push-ups now deal damage directly instead of charging the Legend Strike: each verified rep makes the
hero strike the nearest enemy for 4× hero damage (knee reps 50%). A new **Armory** (Hero → Gear)
sells a ladder of 7 swords for gold, unlocked by campaign progress; a better sword raises hero damage
and therefore damage per push-up. The Legend Strike remains as an ability that charges on its own.
The battle HUD shows damage per rep, results show total push-up damage, and Home/Hero show a nudge
when a new sword is affordable. Balance re-simulated (see GAME_DESIGN.md §12).

## Features that work now

- **Battle:** deterministic lane combat, 15 cards with distinct abilities, auto-deploy for idle play, Legend Strike with boss interrupts, War Cry, 5 enemy roles, elites, mini-bosses and 3-phase bosses with telegraphed attacks, 1×/2× speed, pause and retreat (keeping rewards), contextual tips.
- **Exercise:** camera setup flow, side or front placement, full or knee push-ups, calibration, live rep counter and feedback, tracking pause on loss, knee reps at 50%, daily reward soft cap, simulated reps clearly separated from verified ones.
- **Modes:** campaign (Story / Normal / Heroic), branching dungeons, Endless Siege, Blitz, Weekly Challenge with modifiers, Friend Challenge with normalized levels.
- **Meta:** card collection with filters, sorting, upgrade preview, synergy hints, auto-build and deck codes; hero stats, gear, pets and cosmetics; base with 9 buildings and 2 builders; quests, achievements and streaks; chests and shop (no real-money purchases).
- **Persistence:** autosave (debounced and on app hide), rolling backup, checksum, repair of invalid fields, corrupt data preserved instead of deleted, export/import, reset with confirmation.
- **Presentation:** original procedural art for every unit, enemy, boss, building, item and pet; world backgrounds; damage numbers, projectiles, splash rings, lightning, death and coin particles, boss and phase banners, screen shake; synthesized music and sound effects.
- **Native shells:** Capacitor Android and iOS projects with camera permissions declared.

## Architecture

```
React screens ──► GameStore (src/app/store.ts) ──► pure systems (src/core/systems)
     │                 │  structuredClone + debounced SaveManager
     │                 ▼
     │          GameState (src/core/state/types.ts, versioned)
     │
BattleScreen ──► Battle engine (src/core/combat) ◄── verified reps ◄── RepCounter ◄── PoseCamera (MediaPipe)
     │               │ events                          (src/core/exercise)       (src/platform/pose.ts)
     ▼               ▼
BattleRenderer (Canvas 2D, procedural sprites)
```

- Balance values live only in `src/core/config/balance.ts`; content lives in `src/core/content/`.
- The combat engine, rep counter and systems are pure TypeScript with injected time and seeded RNG.
- `finalizeBattle()` is the only place battle results touch the save, and it only adds.

## Tests run (actual results)

| Check | Command | Result |
| --- | --- | --- |
| Type check (strict) | `npm run typecheck` | Pass, 0 errors |
| Unit + invariant + simulation tests | `npm test` | **105 passed / 105** (7 files: exercise 22, no-loss 8, combat 21, systems 31, save + social codes 14, simulation 6, armory 3) |
| Production build | `npm run build` | Pass (main bundle 515 kB / 157 kB gzip; MediaPipe loaded lazily, 154 kB) |
| UI smoke test, headless Chromium 390×844 | `scripts/e2e-smoke.cjs` | Pass: intro → first battle → victory → all tabs → card/building modals → shop → modes → social → settings → pre-battle → camera setup → battle with camera. No app errors in the console (only headless GPU driver warnings). |
| Pose pipeline in a browser | same, with Chromium's fake camera | MediaPipe WASM and the bundled model load and run ("Tracking: searching" on the synthetic test video, correctly 0 reps). |
| Native compile | - | **Not run**: no Android SDK or Xcode in this environment. The Capacitor projects were generated and permissions added. |
| Physical devices | - | **Not run**: no phone available here. Real-world rep counting accuracy is not yet verified. |

Test coverage highlights:

- **Exercise:** valid full and knee reps, different speeds and frame rates, the exact state order, noisy landmarks over 5 seeds, partial reps, jitter at the top, too-fast reps, sagging hips, knee push-ups in full mode, standing arm curls, duplicate / out-of-order / frozen frames, tracking loss mid-rep (pause, no count, recovery), short dropouts, low visibility, calibration success and failure, reward multipliers.
- **No-loss rule:** real lost battles, 300-case fuzz over modes and outcomes, kept gold, boss checkpoints, dungeon losses, streak gaps.
- **Combat:** determinism, valor costs and regen, hand cycling, rep effects, War Cry, simulated reps, targeting rules (melee vs fliers), armor, boss phases, telegraphs and interrupts, victory / defeat / timeout, endless mode, wave composition.
- **Systems:** economy monotonicity and bounds, card upgrades and surplus conversion, deck limits, gear stars, pets, buildings (timers, builders, castle gating, gem skip, mine), idle accrual, diminishing returns, cap, clock rollback and forward jumps, offline report, quests, rerolls, achievements, streaks, chest odds vs observed frequencies, shop.
- **Save:** round-trip, backup fallback after a torn write, unreadable data preserved, checksum mismatch, newer-version rejection, field repair, empty equipment slots, interrupted upgrades; social codes.
- **Balance simulation:** 40 simulated days for three player profiles (see GAME_DESIGN.md §12).

## Known issues and limitations

- Rep counting is only validated against synthetic landmark sequences and a fake camera. It needs testing with real people, lighting, phones and camera angles; thresholds are configurable for that tuning. Front placement is less reliable than side placement.
- Native builds were generated but not compiled or run on devices here.
- The final boss (stage 5-10) needs a near-maxed army on Normal; the simulator shows idle players beating it around day 19 and casual players around day 37. Intended as a long-term goal, but it may need softening after playtests.
- All online features (accounts, cloud saves, friend requests, global leaderboards, guilds, co-op bosses, seasonal events) are planned only.
- Music and sound effects are simple synthesized placeholders behind a `SoundId` interface; real audio assets can replace them.
- Haptics use the Vibration API (works on Android; iOS WebViews ignore it). A Capacitor Haptics plugin would add iOS support.
- `npm audit` reports 3 moderate advisories in a dev-only dependency chain (`@capacitor/cli` → `xcode` → `uuid`); they don't ship in the app.

## Next steps

1. Playtest rep detection on real Android and iOS devices; tune thresholds and guidance text from recordings of landmark data (not video).
2. Compile and run the Capacitor apps; add the Capacitor Haptics plugin and native splash/icon assets.
3. Playtest balance with real players, especially the World 4-5 pacing and the final boss.
4. Add more cards per world and boss variety; more gear sets with set bonuses.
5. Backend phase per BACKEND_PLAN.md: accounts → cloud saves → friend requests → validated leaderboards → guilds.
