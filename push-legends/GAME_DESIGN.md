# Push Legends - Game Design

Push Legends is a fantasy idle RPG where real push-ups, detected by the phone camera, power an army.
It is a game first and a fitness game second: everything is playable without exercise, and exercise
makes progress noticeably faster and more fun.

All numbers below come from `src/core/config/balance.ts` (the single source of truth) and the
content files in `src/core/content/`. Change them there; never hardcode them in screens.

---

## 1. The no-loss rule (mandatory)

**A player never loses permanent progress or possessions.** Enforced in code and in tests:

| Rule | Where it is enforced |
| --- | --- |
| Rewards earned during a battle are always kept (win, loss, timeout or retreat) | `finalizeBattle()` in `systems/progression.ts` grants `kept` rewards unconditionally |
| Battles have no entry fee and no negative reward | `grantReward()` clamps every reward to `>= 0` |
| Upgrades never consume the card or item | `upgradeCard()`, `upgradeItem()` only spend gold, fragments and ore |
| Duplicates are always useful | Max-level card fragments become **Glory**; duplicate items add stars, then ore; duplicate pets add stars, then treats |
| Buildings never downgrade | Upgrades only increment; a building keeps working while upgrading |
| Streaks never take things away | Missing a day uses a **rest token**; without one only the streak *bonus* resets |
| Boss walls are recoverable | Reaching a boss saves a **checkpoint** (start straight at the boss next time); **Story** difficulty still unlocks the next stage; idle income and the gold mine keep producing |
| Dungeon losses | Each cleared room's reward is granted immediately; losing just ends the run |

Regression tests: `tests/noLoss.test.ts` (real lost battles, 300-case fuzz across modes and outcomes,
checkpoints, dungeon losses, streak gaps).

After a defeat the result screen shows: how far the player got (waves, boss phases, boss health),
rewards kept, up to four concrete suggestions (anti-air, tank, splash, interrupt timing, unspent
valor, affordable upgrades, Barracks), **Retry now**, **Retry on Story difficulty**, and boss retry
from the checkpoint.

---

## 2. Core loop

1. Pick a stage on the world map (5 worlds × 10 stages; stage 5 = mini-boss, stage 10 = world boss).
2. The army fights automatically in a side-scrolling lane. Enemies walk in from a portal on the right.
3. The player drags cards from a 4-card hand (8-card deck) onto the field, placing the troops where they want, using **valor** (regenerates over time). A quick tap sends them out of the gate instead.
4. Every real push-up is a **sword strike**: the hero hits the enemy closest to the gate. Reps also add valor and build **War Cries**.
5. Gold buys better swords in the **Armory**, which raise hero damage and therefore damage per push-up.
6. Waves → elites → bosses with telegraphed attacks and multiple phases.
7. Rewards: gold per kill, stage-clear bonus (×3 on first clear), hero XP, ore, card fragments, chests, gear, pets.
8. Spend on swords, cards, gear, pets and buildings. Base and army keep producing while away.

The first launch goes straight from a one-screen intro into stage 1-1 (no camera needed), with
contextual tips instead of a tutorial wall.

---

## 3. Exercise recognition

Pipeline (`src/core/exercise/`, pure TypeScript, fully unit-tested with synthetic landmarks):

```
camera frame → MediaPipe Pose Landmarker (on-device, WASM/GPU) → 33 landmarks
  → measure(): elbow angle, body line, knee angle, torso tilt, confidence, guidance
  → RepCounter state machine → verified rep → battle.registerRep(kind, verified=true)
```

**State machine:** `NOT_READY → READY → DESCENDING → BOTTOM → ASCENDING → COOLDOWN → READY`,
plus `PAUSED` when tracking is lost.

| Parameter (default) | Full | Knee |
| --- | --- | --- |
| Top threshold (elbow angle) | 150° | 150° |
| Bottom threshold | 100° | 105° |
| Hysteresis | 8° | 8° |
| Minimum range of motion within a rep | 40° | 40° |
| Rep duration | 450 ms - 10 s | same |
| Cooldown after a rep | 150 ms | same |
| Minimum landmark confidence | 0.5 | same |
| Tracking lost → pause after | 700 ms | same |
| Minimum body line (shoulder-hip-ankle / -knee) | 145° | 130° |
| Full mode: minimum knee angle (straight legs) | 140° | - |
| Side placement: max torso tilt from horizontal | 55° | 55° |
| Max fraction of bad frames in a rep | 35% | 35% |

A rep only counts if it went from the top through the bottom and back, with enough range of motion,
plausible timing, acceptable form and reliable tracking. Duplicate frames, out-of-order frames and
frozen frames are ignored. Calibration (hold top, then bottom) sets personal thresholds:
`top = measuredTop - 12°`, `bottom = measuredBottom + 15°`, `minROM = 60% of the measured range`.

Feedback is phrased as coaching ("Go a bit lower for it to count", "Tracking is unsure - try more
light"), never as an accusation. Video never leaves the device and is never stored; only the current
frame's landmark points are used. Calibration saves two angles.

**Rewards:** a verified full push-up = 100%, a knee push-up = `kneeRepMultiplier` (50%).

| Effect per verified rep (× rep multiplier × push-up power) | Value |
| --- | --- |
| **Push-up strike** | Hero hits the enemy closest to the gate for `4 × hero damage` (bosses also × boss damage), 40% splash within 6 units; weapon effects (burn, slow, chain, lifesteal) apply |
| Valor | +1.5 |
| War Cry progress | +1 (10 → +40% army damage for 10 s) |

Push-ups no longer charge the Legend Strike; it charges on its own over 50 s. Reps done while no
enemy is on the field are saved (up to 5) and released when the next wave arrives.

**Armory (swords for gold):** damage per push-up = `hero damage × 4 × push-up power`, and hero damage
= `(26 + weapon damage) × 1.05^(level−1)`, so a better sword directly means harder push-ups. The
Armory sells a sword ladder unlocked by campaign progress, priced at 240 seconds of the reference gold
rate at the unlock stage (`armoryPriceSeconds`). Bought swords auto-equip if stronger; old swords are
kept and can still be upgraded at the Blacksmith (which also raises push-up damage).

| Sword | Hero damage | Unlocks at stage |
| --- | --- | --- |
| Recruit's Blade | +8 | start |
| Iron Longsword | +18 | 1-4 |
| Frostbite Saber | +26, slows | 1-9 |
| Emberbrand | +38, burns | 2-6 |
| Oathkeeper | +52, +5% crit | 3-3 |
| Stormcaller Greatsword | +68, chains | 3-10 |
| Sunforged Blade | +88, +15% boss damage | 4-7 |
| Dawnbreaker | +115, lifesteal | 5-4 |
| Direct gold | 6 s of the current stage gold rate (Training Grounds +6%/level) |
| Hero XP | +3 |

Healthy limits: direct rep rewards are full for the first **100 reps per day**, then 25%.
Exercise quests are capped at one per day, are modest (20/day, 100/week) and can be swapped for a
non-exercise quest. **Developer simulated reps** produce combat effects only: they never count as
verified exercise, never pay rep gold or XP, never advance exercise quests or achievements, and mark
shared challenge codes as "assisted".

---

## 4. Combat

Deterministic fixed-step simulation (`src/core/combat/engine.ts`, 20 ticks/s, seeded RNG). The same
setup always produces the same result, so balance can be simulated and tested.

- **Lane:** 1D positions; ground units block ground units; flying enemies dive past tanks to the back line.
- **Valor:** max 10, starts at 5, +0.5/s. Cards cost 2-7.
- **Hand:** 4 cards cycle through the 8-card deck (played card goes to the back of the queue).
- **Drag to place:** drag a card onto the field and drop it. While dragging, the allowed deploy zone
  lights up blue (from the gate up to the middle of the field, `deployMinX`-`deployMaxX`, and never
  closer than `deployEnemyGap` to the nearest enemy), the rest of the lane is tinted red, and a
  see-through preview of the troop follows the pointer. Drops outside the zone are moved to its
  nearest point; the lane position (left/right) is kept. Squads stand in a small formation around
  the drop point. Without enough valor the marker turns red and says how much is missing, and the
  drop does nothing. Releasing over the hand cancels. A quick tap deploys at the gate as before.
- **Auto-deploy** (optional, off by default): meant for idle play or for doing push-ups hands-free.
  The AUTO button in battle affects that battle only; "Start battles with auto-deploy on" in
  Settings or the pre-battle panel is the only persistent switch. Playing a card yourself (tap or
  drag) switches it off for the rest of the battle, so it never spends the valor you are saving. It scores the hand (anti-air if fliers and none deployed, a tank if none, healer if allies are hurt, splash against big groups) and deploys the best affordable card when enemies are close.
- **Push-up strikes:** see §3 - every verified rep deals damage directly.
- **Legend Strike:** charges on its own in 50 s (push-ups do not charge it). Hits enemies near the frontline (and any boss) for 9× hero damage, stuns, and **interrupts** every boss telegraph.
- **Damage:** `damage × buffs × (1 − resistance[type]) × armor`, where armor applies fully to physical and 30% to other types. Types: physical, fire, frost, lightning, holy. Worlds and bosses have resistances and weaknesses.
- **Enemies:** normal, ranged, fast, armored, flying; elites (×3.2 HP, ×1.6 damage, ×5 gold) and mini-bosses / bosses.
- **Bosses:** 3 phases (100% / 60% / 30% HP) with different abilities, attack speed, damage and resistances. Abilities are telegraphed on the ground (slam, breath, drain = lines; meteor, volley = circles; summon; shield). Meteors target army units, never the hero unless no units are deployed.
- **Ending:** victory when all waves are cleared; "not yet" when the hero falls or time runs out (210 s, +120 s on boss stages). Endless and Blitz runs end as "complete".


**3D battlefield** (`src/ui/battle3d/`, three.js, all models generated in code): the deterministic
combat engine is unchanged; the 3D scene only reads its state and events.

- The arena is seen from behind the hero, looking up a paved road toward the enemy portal, like a
  mobile arena battler: checkered turf, a curbed stone road, hedges or walls framing both sides,
  the hero's gatehouse with two towers at the bottom. The camera fits the whole lane to any screen.
- Each world has its own battlefield: enchanted forest with glowing mushrooms, snowy pines and ice
  spikes, a volcano with lava pools and cracks, a ruined fortress with graves and pillars, and a
  crystal realm. Ambient particles (fireflies, snow, embers, dust, sparkles), the hero's keep with
  a flag on the left and a swirling enemy portal on the right.
- **Look (realistic stylised):** physically based materials (`realMaterial` in `style.ts`) on the
  vertex-coloured models. A band-limited world-space noise adds colour patches, fine grain, a
  warm/cool drift and a bump on the normals, so stone, grass, wood and cloth catch the light
  unevenly; colours marked as metal (steel, gold, blades) become polished metal that reflects the
  sky. Lighting is a low warm sun with soft 2048 px shadows, an image-based sky dome
  (`skyEnvironment`) for reflections and soft fill, ground-truth ambient occlusion (GTAO) for
  contact shadows, aerial fog, ACES filmic tone mapping and a grade with split toning, contrast and
  vignette. Glowing materials (magic, eyes, lanterns, lava, the portal) still bloom. Characters use
  a cleaner variant (less grain and bump). No ink outlines.
- Every card, enemy role (tinted per world), mini-boss and boss has a detailed model with heroic
  proportions (humanoids are about four heads tall: smaller head on its own neck pivot, longer
  thighs and shins, longer arms, rounded shoulders, natural-sized eyes) and a wide shape vocabulary: lathed helmets, hats, robes, flasks and torsos
  (V-shaped chests), bevelled blades, axe heads and kite shields, curved tapered horns, hair locks,
  bows, roots and tails, folded capes and cloth panels, eyelids that set the mood, and: big heads with eyes, pupils, highlights, brows that show the mood,
  nose, mouth, cheeks, mustaches or beards; helmets with nose guards and plumes, hoods, hats,
  crowns; chest plates, shoulder pads, belts with buckles, boots and gloves; detailed swords, bows
  with quivers, staffs with glowing orbs, shields with rims and bosses. Models are rigged with legs,
  arms, wings and capes. Fight animations (`animateUnit` in `BattleScene3D.ts`):
  fighters turn to face their opponent and step across the lane to meet it face to face, keep a
  sword's length apart and take a guard stance (bent knees, staggered feet, weapon and shield up,
  sway). Each blow is staged around the engine's timing: a wind-up while `attackCd` runs out, a
  fast strike when `lastAttackAt` fires, then a recovery. Melee units cycle three swings (overhead
  chop, side slash with a body twist, lunging thrust) with dust on the step-in; archers draw and
  release with recoil, casters raise the staff and push the spell forward, throwers wind back and
  throw, flyers rise and dive, mounts rear up and pounce. Hits stagger the target away from the
  attacker (heavy hits and crits knock it back with a hop), the head snaps back, shields come up to
  block with a spark, and simultaneous blows clash with sparks and a small shake. The fallen face
  their killer, topple backwards with a bounce, lie still and darken, then sink into the ground.
  Also: walking with leg swing and bobbing, wing flaps, cape sway, freeze/burn/boss-cast tints,
  shield bubbles, stun wobble, allies dropping in from the sky with a dust ring and squash on
  landing, enemies growing out of the portal, and death bursts with gold. Developer close-up:
  `?debug=1&zoom=0.5` follows the front line (`&front=1` for a three-quarter view).
- Effects: arrows, spell orbs and lobbed bombs, a golden crescent per push-up strike with a
  shockwave, splash rings, chain lightning, meteor telegraphs with falling meteors, the Legend
  Strike sweep, rebirth pillars, a war-cry ground glow, camera shake and a camera push-in when a
  boss arrives, sword-slash arcs on melee hits, star sparks on critical hits, dust under walking
  feet and a spinning rune when a card is deployed. The arena has banner poles along both edges,
  supplies and a stone gatehouse with towers, an arch and a portcullis behind the hero. Damage
  numbers, health bars and banners are drawn on a 2D overlay.
- **Graphics setting** (Settings → Graphics): "Smooth" (default) renders the detailed 3D at full
  resolution with the realistic lighting, shadows and ambient occlusion; "Pixel 256" renders the 3D battle and base
  at 256 pixels height with hard pixel edges for a pixel-art look. Players who never picked a style
  get the current default. Reduced motion stops idle animation, shake and most particles.
- three.js is loaded only when needed; without WebGL the original 2D renderer is used.

### Worlds and bosses

| World | Theme | Resists / weak | Mini-boss | Boss (signature mechanic) |
| --- | --- | --- | --- | --- |
| Verdant Wilds | Enchanted forest | weak to fire | Mossback Troll | Grovemaw - Root Slam, sapling swarm, bark hardens |
| Frostfang Tundra | Frozen wasteland | resists frost, weak to fire | Yeti Chieftain | Queen Rimeclaw - Frost Breath slows, Ice Carapace, Blizzard |
| Emberforge Kingdom | Volcanic | resists fire, weak to frost | Forge Overseer | Magmaroth - meteors, lava armor, imp eruption |
| Shattered Bastion | Ruined fortress | weak to holy | Grave Warden | The Hollow King - bone guard, Soul Drain heals him |
| Umbral Crystal Depths | Dark crystal | resists lightning, weak to physical | Shardmaw | Nyxara - flying gem, shard storms (bring anti-air) |

---

## 5. Cards

15 cards: 5 common, 4 rare, 4 epic, 1 legendary, 1 mythic (`content/cards.ts`). Each has rarity, role,
cost, health, damage, attack speed, range, targets, damage type, ability, description, synergies and
weaknesses. Rarity is shown with a symbol and name as well as colour (● ◆ ★ ♛ ✦).

| Card | Rarity | Role | Cost | Signature |
| --- | --- | --- | --- | --- |
| Thornbow Archers (×2) | Common | Ranged | 3 | +50% vs flying, shoots fliers first |
| Oakshield Knight | Common | Tank | 3 | Taunts nearby enemies |
| Field Medic | Common | Support | 2 | Heals the most injured ally |
| Wolf Rider | Common | Melee | 3 | Very fast, 250% first hit |
| Powder Bombardier | Common | Area | 2 | Splash, ×2 vs armored |
| Ember Mage | Rare | Area | 4 | Fire splash + burn |
| Hawkeye Ranger | Rare | Ranged | 4 | Targets elites/bosses, crits |
| Dawn Paladin | Rare | Support | 4 | Heal aura + 15% damage aura |
| Aegis Guardian | Rare | Tank | 5 | Periodic shields for nearby allies |
| Bastion Golem | Epic | Tank | 6 | Heavy armor, ×2 vs bosses/elites |
| Frost Witch | Epic | Area | 4 | Area slow |
| Shade Assassin | Epic | Assassin | 3 | Leaps to weak targets, executes |
| Storm Adept | Epic | Area | 5 | Chain lightning |
| Phoenix Warden | Legendary | Area (flying) | 6 | Splash, rises again once |
| Aurora Drake | Mythic | Area (flying) | 7 | Breath hits all in range, hastes the army |

**Progression:** stats ×1.115 per level (max 20). Level L → L+1 costs `25 × 1.4^(L−1)` gold (Academy
discount up to 35%) and `fragmentsPerLevel[rarity] × L` fragments (common 4, rare 3, epic 2,
legendary/mythic 1). Commons upgrade fastest and stay viable. Cards unlock on their scheduled
first-clear stage; chests can also discover cards from worlds already reached. Stage drops only give
fragments of owned cards.

**Deck tools:** deck editor with sort/filter, upgrade preview with current vs next stats, synergy
hints (missing tank / anti-air / splash), **Auto-build** (balanced deck), and shareable deck codes.

---

**Card faces:** every card shows an original close-up character portrait drawn in code
(`src/ui/art/portraits.ts`): a big expressive face with its own headgear, prop and themed
background (forest, castle, lava, storm, aurora...). The frame colour and glow follow the rarity,
the valor cost sits in a pink drop in the top-left corner, and the level is a small pill at the
bottom with the fragment bar below the card. Portraits animate subtly (blinking, flames, sparks,
snow) in the card detail view.


## 6. Hero, gear and pets

- **Hero:** HP `(420 + gear) × 1.055^(level−1) × army health`, damage `(26 + gear) × 1.05^(level−1)`, max level 60. XP to level: `60 × 1.16^(level−1)`.
- **Gear:** 6 slots (weapon, helmet, chest, gloves, boots, relic), 25 items. Stats: hero damage/health (flat), attack speed, crit, push-up power, special charge, army damage/health, gold, boss damage, offline bonus. Some items have effects (burn, slow, chain, lifesteal, a shield per push-up). Item level cap = Blacksmith level × 5; cost `60 × 1.28^(L−1)` gold and `3 × 1.22^(L−1)` ore. Each star +15% stats.
- **Pets:** Ember Fox (gold), Pebble (hero health, periodic shield), Sparkwing Hatchling (army damage, fireball), Moonmoth (offline bonus), Frostpup (push-up power, slow aura). One active pet. Level 1-30 with gold + treats; stars from duplicates; Pet Sanctuary +5%/level.
- **Cosmetics:** capes and auras from achievements and first boss kills.

---

## 7. Economy

| Formula | Value |
| --- | --- |
| Enemy health/damage multiplier at global stage `g` (0-49) | `2.6 × 1.05^g × 1.06^world × difficulty` |
| Difficulty (power / rewards) | Story 0.65 / 0.6, Normal 1 / 1, Heroic 1.45 / 1.8 |
| Gold per kill | `3 × 1.07^g × roleWeight` (elite ×5, mini-boss ×20, boss ×50) |
| Stage clear gold | `40 × 1.07^g` (×3 first clear) |
| Reference gold rate (quests, idle, rep gold) | `killGold × 0.8 + clearGold / 75` per second |
| Building cost | `costBase × costGrowth^level` |
| Building time | 3 s for level 1, then `10 s × 1.9^(level−1)`, capped at 4 h; 2 builders; gems can finish early |
| Castle cap | 1 + one level per 5 stages cleared; other buildings ≤ 2 × castle level |

**Gems** are earned only through play (boss first clears, achievements, quests, weekly records) and
buy chests or skip build timers. **There are no real-money purchases and no paid random rewards.**
Chest odds are shown before buying and match the code exactly (verified statistically in tests).

---

## 8. Idle and offline progression

- **War Chest:** army income = `3%` of the reference gold rate at the best cleared stage, per real second, × offline and gold bonuses. Full rate for the first 2 h, then 60%, capped at 8 h (+1 h per Treasury level, max 24 h).
- **Gold Mine:** `90 × 1.24^(level−1)` gold/hour, stores `3 + 0.5 × Treasury level` hours.
- **Welcome back:** after 1 minute away, a report shows enemies defeated, War Chest gold, ore, mine gold, finished buildings and available upgrades. After 12 h away a free chest is added (silver after 48 h).
- **Clock protection:** time moved backwards grants nothing (and removes nothing); timers left in the future are re-anchored; time jumped forward is capped by the same limits.

Idle income is deliberately small compared to active play, about 20 minutes of active play per day,
so playing and exercising accelerate progress while breaks are never punished.

---

## 9. Base

Castle, Gold Mine, Barracks (+4% army health, +2.5% damage per level), Training Grounds (+5%
push-up power, +6% rep gold), Academy (card discount, extra fragments), Blacksmith (gear cap and
discount), Treasury (offline cap, mine storage), Pet Sanctuary (+5% pet bonuses), Guild Hall (+4%
quest rewards; online guilds planned). Buildings are drawn procedurally and grow with their level.

**3D base view** (`src/ui/base3d/`, three.js, all geometry generated in code, no external models):

- A walled fortress town seen from an isometric-style camera: stone walls built from staggered
  blocks with a walkway and merlons, round towers with block rings, corbels, arrow slits and
  shingle-ring roofs, a gatehouse with an arch, portcullis, cloth banners and a "PUSH LEGENDS"
  sign, a moat with stone banks, sparkles and a wooden bridge, cobblestone roads, a lawn with
  instanced grass tufts and flowers, a fountain with animated water jets, market stalls, lantern
  posts, catapults and cannons, trees and rocks outside, drifting clouds and circling birds.
- Rendering matches the battle: physically based materials with procedural surface detail, a sky
  environment, soft shadows, GTAO contact shadows plus baked ground ambient occlusion, bloom on
  glowing materials (windows, forge, gold, magic, lanterns) and a filmic grade, through a shared
  pipeline (`render.ts`) with multisampled anti-aliasing. The palette is muted and natural
  (terracotta and slate roofs, weathered wood and stone, olive grass).
- Each of the 9 buildings is assembled from architectural pieces (`models.ts`): stone block walls,
  shingled gable and cone roofs, timber frames, arched plank doors, framed arched windows,
  chimneys and cloth banners. Visuals step through 5 tiers spread over each building's level
  range. Castle: keep, gatehouse with portcullis and crest, 2 → 4 towers, an upper keep, a tall
  rear tower and gold trims. Gold Mine: faceted rock hill with glowing gold veins, timber-framed
  entrance, rails and an animated cart, gold piles that grow with stored gold, lanterns, a hoist
  with a turning wheel and a second entrance. Academy: block-built wizard tower with a balcony,
  glowing windows and a floating orb with orbiting rings, a timber library, lectern, telescope
  and a floating crystal. Barracks: timber hall, striped tents, a weapon rack, training dummy,
  watchtower and a patrolling guard. Training Grounds: fenced yard, hurdles, climbing frame,
  weights, a scoreboard, soldiers doing animated push-ups on mats and a pacing drill sergeant.
  Blacksmith: stone workshop with an awning, smoking chimneys, a forge with glowing coals and
  flames, bellows, anvil, sword rack, quench barrel, ore and a spinning grindstone. Treasury:
  marble temple with columns, pediment, golden door, a golden dome, coin piles and glowing chests.
  Guild Hall: timber hall with a steep roof, shield emblem, banners and a bell tower. Pet
  Sanctuary: picket fence, pond with lily pads, kennel, flower beds, a fountain and the player's
  pets (sculpted fox, moth, pebble golem, pup and hatchling) wandering around.
- Unbuilt plots show a roped-off site with a signpost (or a padlocked stone plinth with chains and
  the required Castle level); upgrading plots get scaffolding, materials and a swinging crane.
- Soldiers in your deck's colours (more with higher Barracks level) and the hero patrol the roads.
- Upgrading one building never changes another: each plot is rebuilt only from its own state.
- three.js is loaded only when the Base tab opens; rendering pauses while the app is hidden;
  reduced motion stops the animation. Devices without WebGL get the earlier 2D painted scene.

---

## 10. Modes

| Mode | Rules | Rewards |
| --- | --- | --- |
| Campaign | 50 stages, Story / Normal / Heroic | Kill gold, clear bonus, fragments, unlocks, chests |
| Dungeon Delve | 6 floors of branching rooms: Skirmish, Swarm (+60% gold), Elite Lair, Campfire (+25% army for the run), Treasure, Card Shrine (pick 1 of 3), Boss | Banked per room; 3 full-reward runs/day, then 30% |
| Endless Siege | Waves grow 9% each; elites every 5th, bosses every 10th | Kill gold, ore per 4 waves, gems for records |
| Blitz Trial | 90 s, as many kills as possible | Ore and treats by score |
| Weekly Challenge | Shared weekly seed + 2 modifiers (Swift Foes, Iron Skin, Sky Raid, Glass Cannon, Elite Surge, Rally) | Gems + ore for improving this week's best |
| Friend Challenge | 90 s Blitz on a shared seed, all cards normalized to level 10, baseline hero | Half kill gold; nothing wagered |

---

## 11. Quests, achievements, streaks

- **Daily:** 4 from a pool of 10 (at most one exercise quest), deterministic per day, 1 free swap/day.
- **Weekly:** 3 from 7.
- **Achievements:** 12 tiered achievements (combat, exercise volume and *consistency*, collection, building, story, strategy such as interrupts and endless records), gems + XP per tier, cosmetics at final tiers.
- **Streak:** +2% battle gold per consecutive day (max +20%); a rest token every 5 days (max 2).

---

## 12. Balance verification

`src/core/sim/simulate.ts` plays the campaign headlessly with three profiles (exerciser: 15 battles a
day with 5 reps each; idle: same play time, no reps; casual: 6 battles a day, no reps) and a simple
spending policy. `tests/simulation.test.ts` asserts that nobody soft-locks, exercise speeds up the
mid-game without leaving idle players far behind (less than 3×), the campaign lasts more than a week
for heavy players, and gold stays bounded. Run `npm run simulate` for the report. The latest run
(40 simulated days):

```
exerciser stages 50/50  W1:day 0.5  W2:day 1.3  W3:day 4.7  W4:day 8.5  W5:day 12.5
idle      stages 50/50  W1:day 0.5  W2:day 1.3  W3:day 6.7  W4:day 12.7 W5:day 19.3
casual    stages 50/50  W1:day 1.6  W2:day 3.3  W3:day 9.3  W4:day 16.3 W5:day 37.3
```

Known balance notes: the final boss (Nyxara) needs a near-maxed army on Normal, so the last stage is
a long-term goal; Story difficulty and Heroic replays exist on either side of it.
