# Push Legends - Server (login, cloud saves, friends)

**The game starts with a login screen**: players create an account (username + password) or log
in before they can play. Accounts, cloud saves and online friends (friend requests, online status,
friends' progress, duels sent to a friend, ranking among friends) run on a small server you host
yourself. Everyone who wants to play together uses the **same** server.

Once logged in, a device stays logged in (also when the server is briefly unreachable: the game is
played and saved locally and backed up again when the server is back). The save is uploaded every
minute while playing and when the game is put away. Logging in on another device brings the
progress along; if both the account and the device hold different progress, the player chooses
which to keep and the other is kept as a backup on the device (`push-legends/replaced-save`).

The server is `server/main.mjs`: plain Node.js (18 or newer), no extra packages, data in one JSON
file.

## Start it

```bash
cd push-legends
npm run friends-server          # = node server/main.mjs, port 8787, data in ./friends-data.json
# options: node server/main.mjs --port 8787 --data /path/to/friends-data.json --host 0.0.0.0
```

In the game: the login screen shows the server address (default `localhost:8787`, or a build-time
`VITE_FRIEND_SERVER`); tap **Change** to enter another one, then create an account or log in.
Friends: profile button (top left) → **Friends** → add a friend's code; they accept the request.
Log out under Settings → Account or in the Friends tab.

## Who can reach it

| Where the server runs | Address players enter | Works for |
| --- | --- | --- |
| Your Mac | `localhost:8787` | Games on that Mac |
| Your Mac, same Wi-Fi | `192.168.x.x:8787` (System Settings → Wi-Fi → Details → IP address) | Everyone on your network |
| A cloud host (Render, Railway, Fly.io, a VPS...) | `https://your-app.example.com` | Everyone |

For friends outside your home network use a cloud host with HTTPS. Start command
`node server/main.mjs`; the host's `PORT` variable is picked up automatically. Point `--data` (or
`FRIENDS_DATA`) at a persistent disk, otherwise accounts are lost when the host restarts.

The phone apps (Capacitor) load the game from a secure origin, so on phones use an `https://`
server address.

## What it stores and what it does not

- Per account: username, password as a salted scrypt hash (never the password), up to 10 device
  login tokens (SHA-256 hashes only), the latest cloud save (max 900 KB).
- Per account (friends):  a random account id, the friend code, hero name, profile visibility, the showcase
  the player shares (hero level, power, stage, bosses, endless best, verified push-up counts,
  deck), last-seen time, friends, blocked codes. Only a SHA-256 hash of the login token is stored.
- Pending friend requests and duel codes waiting to be picked up.
- No camera data, no pose data, no e-mail, no chat. Names are filtered (letters, digits, a few
  symbols, max 16 characters).

Privacy setting (Profile tab): *Everything* / *Friends see my progress* show the showcase to
friends; *Name and online status only* hides showcase and last-seen time. Non-friends see nothing,
and there is no search: you can only find someone by their code.

Login safety: 8 wrong passwords lock the account's login for 10 minutes; usernames are 3-20
letters, digits, `.`, `_` or `-`; passwords at least 6 characters. Use an `https://` server
outside your home network so passwords are not sent in plain text.

Safety: blocking ends the friendship, removes requests and duels both ways, and the blocked
player's new requests are silently dropped. Limits: 100 friends, 30 friend requests per day, 120
calls per minute, 32 KB per request, 30 waiting duels per player. "Delete server account" in the
game removes the account and every reference to it.

## Fair play

Nothing on the server grants game rewards. Showcase numbers are reported by each player's own
game, so the friends ranking is labelled "for fun, not verified". Duels stay fair because the
duel itself is replayed with the same seed and normalized card levels in the receiver's game.
Verified global leaderboards still need the server-authoritative design in BACKEND_PLAN.md.

## API (JSON, `Authorization: Bearer <token>`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Is this a friend server |
| POST | `/v1/signup` `{username, password, name, code}` | Create an account (upgrades an anonymous device account sent as bearer) → session |
| POST | `/v1/login` `{username, password}` | Log in → `{token, code, name, username, save: {savedAt} \| null}` |
| POST | `/v1/logout` | Sign out this device |
| GET / PUT | `/v1/save` `{data, savedAt}` | Cloud save |
| POST | `/v1/register` `{name, code}` | Anonymous device account (older builds) → `{token, code}` |
| GET | `/v1/me` | Friends, requests in/out, waiting duels, blocked |
| PUT | `/v1/profile` `{name?, privacy?, showcase?}` | Update profile |
| DELETE | `/v1/me` | Delete the account |
| POST | `/v1/friends/requests` `{code}` | Send a request (accepts at once if they asked you) |
| POST | `/v1/friends/requests/:id/respond` `{accept}` | Accept / decline |
| DELETE | `/v1/friends/requests/:id` | Cancel a sent request |
| DELETE | `/v1/friends/:code` | Remove a friend |
| POST / DELETE | `/v1/blocks` `{code}` / `/v1/blocks/:code` | Block / unblock |
| POST | `/v1/challenges` `{to, code}` | Send a duel code to a friend |
| DELETE | `/v1/challenges/:id` | Mark a received duel as picked up |

Tests: `tests/friendsServer.test.mjs` (service logic and a real HTTP round trip with restart).
