# Push Legends - Backend Integration Plan

**Status:** the **friend server is implemented** (self-hosted, see FRIENDS_SERVER.md): device
accounts, friend requests, online status, friends' showcases, blocking, duels sent to friends and a
"for fun" ranking among friends. Everything below that is not part of it (sign-in with Apple/Google,
cloud saves, verified leaderboards, guilds, co-op) is still **planned, not implemented** and labelled
"Planned" in the UI.

What already works offline and is designed to carry over:

- Unique friend codes (`PL-XXXX-XXXX`) generated per save.
- Local contact list with blocking.
- Deck share codes (`PLD1-…`) and asynchronous challenge codes (`PLC1-…`) with typo checksums.
- Fair "Friend Challenge" mode (shared seed, normalized card levels, baseline hero).
- Versioned, checksummed local saves with a storage adapter interface (`StorageAdapter`).

## 1. Accounts and authentication

- Sign in with Apple / Google (required by the stores for social features), plus anonymous device accounts that can be upgraded later.
- Server issues short-lived JWT access tokens and refresh tokens; the client stores them in the platform secure store (Keychain / Keystore via a Capacitor plugin), never in localStorage.
- Friend codes become server-reserved and unique; the local code is claimed on first sign-in.

## 2. Cloud saves

- Implement a `CloudStorageAdapter` behind the existing `StorageAdapter` interface.
- The save format already carries `version`, `savedAt` and a checksum. The server stores the latest N snapshots per account.
- Conflict policy: never silently discard progress. If device and cloud diverge, show both summaries (stage, hero level, cards) and let the player choose; keep the other as a backup snapshot.
- Saves stay usable offline; sync is opportunistic.

## 3. Server-authoritative competition

Client scores are never trusted for leaderboards or competitive rewards.

- **Seeds and setups come from the server.** The client asks for a run token (seed, mode, normalized deck rules, expiry).
- **Replay validation.** The combat engine is deterministic, so the client uploads its command log (deploy times, special uses, rep timestamps). The server re-simulates the battle with the same engine code (shared TypeScript package) and computes the authoritative score.
- **Exercise claims** are inherently unverifiable on the server. Leaderboards for verified push-ups are therefore friends-only by default, rate-limited (daily caps), separated into full and knee push-ups, and visibly marked as self-reported camera counts. They never grant competitive rewards.
- Developer-assisted runs (`devAssisted`, simulated reps) are rejected from ranked boards.

## 4. Friends, privacy and safety

- Friend requests: send by code, accept / decline, cancel; rate-limited per account.
- Privacy settings already exist in the profile (public / friends / private) and will gate profile visibility and leaderboard listing.
- Blocking (already local) becomes server-side: blocked accounts cannot send requests, challenges or messages and do not see the blocker's profile.
- No free-text chat at launch. Names are sanitized (`sanitizeName`) and pass a server profanity filter; reports go to a moderation queue.

## 5. Leaderboards

Boards: highest wave (Endless), bosses defeated, weekly challenge (improvement), arena rating, guild
progress, verified full push-ups, verified knee push-ups (never mixed with full). Friend boards first,
global boards per season. Weekly boards reset; all-time records are kept on profiles.

## 6. Guilds and co-op

- Guild Hall level gates membership size and perks (today it boosts quest rewards).
- Guild achievements and a weekly co-op world boss: each member's battles contribute damage (validated by replay). Rewards are participation-based so nobody "loses" by being in a weaker guild.
- Seasonal events reuse weekly modifiers and add themed bosses.

## 7. Suggested architecture

- API: TypeScript (Node) service sharing `src/core` as a package, so simulation and validation code is identical on client and server.
- Postgres for accounts, friends, saves (JSONB snapshots) and boards; Redis for rate limits and leaderboard sorted sets.
- Endpoints: `POST /auth/*`, `GET/PUT /save`, `POST /friends/requests`, `POST /friends/requests/:id/respond`, `POST /runs` (issue token), `POST /runs/:id/submit` (command log), `GET /leaderboards/:board`, `/guilds/*`.
- Client: implement a `SocialBackend` (already defined) over these endpoints and switch based on sign-in state.
