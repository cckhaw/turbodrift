# Turbo Drift: Neon Circuit

Mobile-first arcade kart racer for the browser. React + Vite + Canvas (pseudo-3D) + Tailwind + Web Audio. No assets, no install.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: rng, track generation, replay verification, API + cloud save (in-memory Postgres), offline queue, headless full races
npm run build
```
CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every PR and on `main`.

## How to play
- **Steer:** drag your thumb left/right anywhere on screen (arrow keys / A-D on desktop). The kart accelerates automatically.
- **Drift / boost:** hold the DRIFT button (bottom-right, `Space`/`Shift` on desktop) while steering into a turn. Hold until the ring turns blue → pink, release for a mini-turbo. Hard corners in worlds 2–3 are very hard to take without drifting.
- Drive through the spinning **?** boxes (race mode) to get an item and tap the item button (or `E`): 🚀 turbo, 🛡️ shield, 🛢️ oil slick, 🎯 homing missile. Items rubber-band: leaders get defence, the back of the pack gets turbos and missiles. Bots use items too.
- **Karts:** Comet (balanced), Rocket (fast, heavy), Phantom (nimble, charges drifts quickly).
- **Time Trial:** solo run with no bots or items against your best-lap ghost for that kart. This is the mode whose times go on the global board (verified server-side).
- **Daily challenge:** one shared track per UTC day (world rotates, seed from the date), played as a time trial. Because everyone gets the same seed, the leaderboard for that seed is the daily board. Streak counter (🔥) for consecutive days.
- Yellow chevrons are boost pads. Wind gates (world 2) and blocks (world 3) slow you down. On sky/lava tracks, leaving the road means a fall.
- 3 laps against 5 bots. Finish top 3 to unlock the next world.

## Worlds
| # | World | Tier |
|---|-------|------|
| 1 | Neon Megacity | Beginner — wide road, gentle curves |
| 2 | Cyber Stratosphere | Intermediate — sky track, moving wind barriers |
| 3 | Obsidian Core | Expert — hairpins, narrow lava bridges |

## Bots
`src/game/engine.ts` (`updateBots`): waypoint following along a precomputed racing line (`track.ts`), look-ahead lane changes, corner braking, plus rubber-banding relative to the player (stronger on the final lap) so races stay close.

## Challenge seeds & leaderboard
`?world=2&seed=98765` rebuilds the identical track (`src/utils/rng.ts`, mulberry32). "Share Scorecard" copies an emoji race matrix and the challenge link.

**Global leaderboard (Neon Postgres, server-verified).** Two Vercel Functions (`api/score.ts`, `api/leaderboard.ts`) talk to Neon through `@neondatabase/serverless` using the `DATABASE_URL` that the Neon integration injects. The `scores` table is created automatically on the first request (`db/schema.sql` is a reference copy). The browser never sees database credentials.

*Anti-cheat.* The simulation runs at a fixed 60 Hz step, and a Time Trial records the player's inputs (run-length encoded, ~20 KB for a full race). The client submits **only that recording**, never a time. `api/score.ts` re-runs the real game engine headlessly with those inputs (`src/game/verify.ts`) and stores the times *the simulation* produced, so a tampered client can't claim a lap it didn't drive. Races against bots aren't replayable across devices, so the global board is **Time Trial only**; races still count for local records and unlocks. Replays are rejected if malformed, if they don't finish 3 laps, or if the resulting lap is faster than a per-world physical limit; each device is also throttled to one submission per 45 s. Remaining limits: someone could still write a bot that *drives* well (inputs are inputs), and clients could replay a friend's recording under their own name.

*Offline.* Time trials that can't be submitted (offline, 5xx, throttled) are queued on the device (up to 10, kept 7 days) and retried on launch, when the browser comes back online, and after the next run. Definitive rejections (4xx) are dropped.

*Ghosts* are stored per world + seed + **kart**, so you never race a ghost from a faster kart.

*Cloud save.* World unlocks, medals, daily streak, name and kart can follow you across devices without an account: Settings → Cloud save gives a secret 12-character sync code; entering it on another device restores the save. Merging only ever moves progress forward, so a stale device can't undo unlocks. `api/save.ts` stores it (strictly validated; creation throttled per IP). Anyone with the code can read and update that save, so treat it like a password. Race results themselves aren't verified, so unlock progress is trust-based.

Without the API (or in `npm run dev`, unless `VITE_API_BASE` points at a deployed API) the board falls back to `localStorage` plus deterministic rival ghosts.

**Settings** (gear icon on the menu, or Settings in the pause menu): sound on/off, music and effects volume, steering sensitivity, vibration, battery saver (lower resolution), screen shake, player name, cloud save, and reset progress.

## Deployment: production only, latest only
- `vercel.json` skips every build that is not on `main` (`ignoreCommand`), so **preview deployments are never created**.
- After a production deployment succeeds, `.github/workflows/cleanup-deployments.yml` (or `npm run deploy` locally) runs `scripts/cleanup-deployments.mjs`, which deletes **all older deployments** and keeps only the latest. It refuses to delete anything unless the new deployment is found and `READY`.
- Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (omit for a personal account).
- Manual deploy: `npx vercel link` once, then `npm run deploy` (always `--prod`). Preview with `npm run cleanup:deployments -- --dry-run` (set `KEEP_DEPLOYMENT`).
