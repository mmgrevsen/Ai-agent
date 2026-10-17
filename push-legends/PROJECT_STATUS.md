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

## Latest change (2026-10-17): log in first, cloud saves

The game now opens on a login screen: create an account (username + password) or log in before
playing. The server (same `server/`, see FRIENDS_SERVER.md) got accounts with salted scrypt
password hashes, multiple device sessions, a login lock-out after repeated wrong passwords, logout
and a cloud save. Devices stay logged in; the save is uploaded every minute and when the game is
hidden; logging in on a new device brings the progress along, and when account and device hold
different progress the player picks one (the other is kept as a local backup). Log out from
Settings → Account or the Friends tab.

Also fixed (found by the login test): tutorial flags and push-up calibration were dropped every
time a save was loaded, so the intro came back after a reload.

Verified: 17 server tests (accounts, wrong passwords, lock-out, no plain-text secrets, anonymous
upgrade, cloud save) and a save test (128 unit tests in total), typecheck, the smoke test (now
signing up on its own server first), and a multi-device browser test: sign up, stay logged in after
reload, log out, wrong password, log in on a second device with the cloud save, the save choice on a
third device with a backup kept.

**The game now needs a running server** (`npm run friends-server`) to get past the login screen.

## Earlier change (2026-10-17): online friends

A working friend system on a small self-hosted server (`server/`, zero dependencies, Node 18+;
`npm run friends-server`, guide in FRIENDS_SERVER.md). In the game (Friends tab) players connect to
the server address and can then: add friends by code (requests with accept / decline / cancel,
mutual requests become friends at once), see who is online and when friends were last seen, follow
friends' progress (level, stage, power, bosses, verified push-ups, deck) according to each
friend's privacy setting, block players (server-side), send a finished duel straight to a friend
(it appears in their Duels list), and compare progress in an "Among friends" ranking (labelled
self-reported, no rewards). A badge on the profile button shows waiting friend requests. Local
contacts without a server still work. No chat, no search, no camera data, no rewards from the
server.

Verified: 10 server tests (service logic plus a real HTTP round trip with restart), a save
migration test (121 unit tests in total), typecheck, and a two-player browser test against a running
server: connect, request, badge, accept, both see each other online with progress, duel delivered,
friends ranking. One player ran the Mac file from `file://`. Not tested: a public cloud host and the
phone apps against an HTTPS server.

## Earlier change (2026-10-16): realistic look and fight animations

The cartoon look was replaced by a realistic stylised one in both battle and base: physically
based materials with band-limited procedural surface detail (colour patches, grain, bump, metal
that reflects the sky), a low warm sun with soft shadows, an image-based sky environment, GTAO
ambient occlusion, fog, ACES filmic tone mapping and a split-tone grade; ink outlines are off and
the palette is muted. Humanoids got heroic proportions (about four heads tall, smaller heads with
smaller eyes, longer legs and arms, shoulders), the camera is a little lower (46°), the checkered
turf became natural grass and the purple gatehouse roofs slate.

Units now really fight each other: they face and step towards their opponent, hold a guard
stance, wind up before each blow (from the engine's attack cooldown), strike with one of three
swings, recover, block with shields, stagger or get knocked back, clash blades, and the fallen
topple backwards, lie still and sink away. Ranged units draw, cast and throw with wind-ups.

Verified: typecheck, 110 unit tests, the browser smoke test, the drag-to-place check, screenshots
of the battle (worlds 1 and 3), the base and a model line-up, and frame-by-frame captures of melee
fights in a temporary deterministic test page (removed again). Performance on real phones is not
measured; "Pixel 256" mode turns ambient occlusion off.

## Earlier change (2026-10-16): drag cards onto the field

Cards can now be dragged onto the battlefield and dropped where you want the troops (CR-style
placement, own visuals): blue deploy zone, red blocked part of the lane, a pulsing edge, a drop
ring and a see-through troop preview in 3D (and the same in the 2D fallback). The engine takes an
optional drop point (`Battle.deploy(slot, { x, lane })`), clamped by `deployZone()`. Tapping still
deploys at the gate.

Auto-deploy could still switch itself back on: the in-battle AUTO button and a "Spend your valor"
tip on the defeat screen saved it as a setting. Now the AUTO button only affects the current
battle, the defeat tip no longer turns anything on, and every save is reset to auto-deploy off once
(only the Settings / pre-battle switch "Start battles with auto-deploy on" persists). Settings and
the pause menu show a build stamp so it is easy to tell which file is open.

Also fixed: the deploy and rebirth light columns and the Legend Strike sweep were planes seen
edge-on after the lane was turned to run up the screen; they now face the camera.

Verified: 110 unit tests (3 new for placement and clamping, migration test updated), typecheck, the
browser smoke test, and Playwright drag checks in 3D and 2D (drop left/right, clamped drop far up
the lane, release over the hand, tap, not enough valor).

## Earlier change (2026-10-16): you choose your own cards

Fixed: players could only pick their first card, because auto-deploy (then on by default) spent
valor the moment it was available. Auto-deploy is now off by default (existing saves are switched
off until the player turns it on themselves), tapping a card switches it off for the battle and
saves the choice, and the button reads AUTO ON / AUTO OFF. With the camera on, a tip suggests
turning AUTO on for hands-free play. Covered by a save test and a browser check.

## Earlier change (2026-10-16): detailed base and battle polish

The base was rebuilt: all 9 buildings are now assembled from architectural pieces (stone blocks,
shingled roofs, timber frames, arched doors and windows, chimneys, cloth banners) with 5 visible
tiers and more animation, and the town around them gained stone block walls, a moat with a
bridge, cobblestone roads, grass and flowers, a fountain, market stalls, lanterns, clouds and
birds. Base and battle now share one render pipeline with multisampled anti-aliasing (the bloom
pass had switched it off), bloom and a colour grade. The battle gained a stone gatehouse, banner
poles, slash arcs, sparks, walking dust and deploy runes. Sculpting tools were moved to
`src/ui/base3d/sculpt.ts` so characters and buildings share them.

Performance safeguards: the battle now simulates up to half a second per frame in small steps, so
a slow frame no longer puts the battle in slow motion (the headless software renderer here runs at
about 1.5 fps, and the first battle still finishes in about 80 seconds), and the 3D views render
at most at 1.5x pixel density (MSAA keeps edges clean).

## Earlier change (2026-10-16): cel shading, outlines, bloom and sculpted models

New rendering style for the battle (and cel shading for the base): toon shading with rim light,
ink outlines, bloom on glowing materials and soft unit shadows. All battle models were rebuilt
from many more shape types (lathed, bevelled, curved and tapered parts, folded cloth). The arena
gained lanterns and grass tufts. Mini-bosses now get their own models (they previously fell back
to the stone golem because their sprite ids did not match).

## Earlier change (2026-10-16): arena camera and detailed cartoon models

The battle is now viewed like a mobile arena battler: the lane runs up the screen from the hero's
gatehouse to the enemy portal, which makes units about twice as large on a phone. All battle models
were rebuilt as detailed, rounded cartoon characters (big expressive faces, armour, weapons, capes)
with smooth lighting; the base's patrolling soldiers use the same models. "Smooth" is now the
default graphics style; "Pixel 256" remains available in Settings.

## Earlier change (2026-10-16): 3D battles and pixel-art mode

Battles are now rendered in 3D (three.js): five themed battlefields, rigged voxel-style models for
all cards, enemies and bosses, and animated walking, attacks, spells, hits, spawns and deaths with
particle effects, push-up strike crescents and camera shake. A new Graphics setting renders the 3D
battle and base at 256 px height ("Pixel 256", default) or at full resolution ("Smooth"). The combat
engine and all balance are unchanged. See GAME_DESIGN.md §4.

## Earlier change (2026-10-16): portrait card faces

Cards now use big close-up character portraits (15 original characters drawn in code) filling the
card, with rarity-coloured frames and glow, a pink valor drop in the corner and the level as a small
pill, in the deck, collection, card details, battle hand and rewards. See GAME_DESIGN.md §5.

## Earlier change (2026-10-16): 3D base

The Base tab is now a 3D walled fortress (three.js, original low-poly models generated in code) with
all 9 buildings on their own plots: Castle, Gold Mine, Academy, Barracks, Training Grounds, Treasury,
Guild Hall, Blacksmith and Pet Sanctuary. Buildings visibly grow through 5 tiers, show scaffolding
while upgrading, locked/unbuilt sites, an animated gold mine with a collect bubble, soldiers doing
push-ups, owned pets and patrolling soldiers. Floating labels show level, upgrade availability and
timers; tapping opens the upgrade panel. The building list below the scene is unchanged. See
GAME_DESIGN.md §9.

## Earlier change (2026-10-16): push-ups deal damage

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
| Unit + invariant + simulation tests | `npm test` | **107 passed / 107** (7 files: exercise 22, no-loss 8, combat 21, systems 31, save + social codes 16, simulation 6, armory 3) |
| Production build | `npm run build` | Pass (main bundle 522 kB / 159 kB gzip; 3D base with three.js loaded lazily, 599 kB / 155 kB gzip; MediaPipe loaded lazily, 154 kB) |
| 3D battle, headless Chromium (SwiftShader WebGL) | Playwright scripts | Pass: first battle, boss stages in all 5 worlds with simulated reps, Pixel 256 and Smooth modes, single-file Mac build from `file://`; no console errors. Frame rate on real phones not yet measured. |
| 3D base, headless Chromium (SwiftShader WebGL) | Playwright script | Pass: fresh and mid-game bases render, labels follow buildings, wheel zoom, tapping the 3D castle opens its panel, single-file Mac build renders it from `file://`; no console errors. Real-GPU frame rate on phones not yet measured. |
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
- Online friends need a self-hosted friend server (FRIENDS_SERVER.md). Sign-in accounts, cloud saves, verified global leaderboards, guilds, co-op bosses and seasonal events are planned only.
- Music and sound effects are simple synthesized placeholders behind a `SoundId` interface; real audio assets can replace them.
- Haptics use the Vibration API (works on Android; iOS WebViews ignore it). A Capacitor Haptics plugin would add iOS support.
- The 3D battle and base have not been profiled on real phones (headless software rendering here runs at only a few frames per second, which says little about phone GPUs); on slow devices "Pixel 256" is also the cheaper mode, and shadows may need a further quality option.
- `npm audit` reports 3 moderate advisories in a dev-only dependency chain (`@capacitor/cli` → `xcode` → `uuid`); they don't ship in the app.

## Next steps

1. Playtest rep detection on real Android and iOS devices; tune thresholds and guidance text from recordings of landmark data (not video).
2. Compile and run the Capacitor apps; add the Capacitor Haptics plugin and native splash/icon assets.
3. Playtest balance with real players, especially the World 4-5 pacing and the final boss.
4. Add more cards per world and boss variety; more gear sets with set bonuses.
5. Backend phase per BACKEND_PLAN.md: accounts → cloud saves → friend requests → validated leaderboards → guilds.
