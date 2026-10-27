# Turbo Drift: Neon Circuit

A mobile-first arcade kart racer that runs in the browser: pseudo-3D drift racing against five AI bots across three worlds, with items, three karts, a daily challenge and a global leaderboard whose times are **verified on the server by replaying your inputs**. Nothing to install and no art assets (everything is drawn on a canvas and synthesised with Web Audio).

**Stack:** React 18 · Vite 5 · TypeScript · Tailwind CSS 3 · HTML5 Canvas · Web Audio API · Vercel Functions · Neon Postgres · Vitest.

## Contents
- [Quick start](#quick-start)
- [How to play](#how-to-play)
- [Features](#features)
- [Settings](#settings)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Leaderboard, anti-cheat and cloud save](#leaderboard-anti-cheat-and-cloud-save)
- [HTTP API](#http-api)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limits](#known-limits)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same network)
npm test           # 156 tests
npm run build      # typecheck + production build
```

In `npm run dev` there is no API: the leaderboard falls back to this device's times plus deterministic rival ghosts, and cloud save is unavailable. The server features run on Vercel (see [Deployment](#deployment)) and are covered by tests that run the same code against an in-memory Postgres.

## How to play

| Action | Touch | Keyboard |
|---|---|---|
| Steer | Drag your thumb left/right anywhere on screen (eased and curved, with full lock reached before the full travel; the anchor follows your thumb, so reversing is instant), or switch to the two **arrow pads** in Settings | ← → or A / D |
| Drift / boost | Hold the **DRIFT** button (bottom right) while steering into a turn, release to boost | Space, Shift or ↓ |
| Use item | Tap the item button next to DRIFT | E, Enter or ↑ |
| Pause | Pause button (top right) | Esc or P |

The kart accelerates automatically. On a desktop the race screen shows the keyboard controls: a card during the countdown and a slim legend along the bottom afterwards.

**Touch tuning** (Settings → Controls): *Touch steering* switches between Drag and Arrows (digital pads that behave like keyboard keys), *Steering sensitivity* sets how far to drag, and *Drift assist* (on by default on touch devices) starts a drift for you when you steer hard through a real bend and lets go (for the boost) when you steer back. You can still hold DRIFT yourself.

**New here?** The first time you press Race you're offered a one-minute guided tutorial, and the menu shows a *Learn to drive* card until you've done or skipped it. You can replay it any time from **Settings → Help → Replay the tutorial**, read the quick reference from the **?** button on the menu (or *Controls guide* in Settings), or just wander around in **Practice** mode.

**Drifting.** Hold DRIFT while steering above a quarter of full lock at more than ~35 % speed. The ring around the button fills as the charge builds (faster in tighter turns, and fastest in the Phantom): at the first level it turns blue and releasing gives a 0.95 s mini-turbo, at the second it turns pink and you get a 1.7 s turbo. While drifting you turn harder and the track's centrifugal push is cut by ~60 %; steering with the drift tightens the arc, steering against it widens it. The worlds get harder to take without drifting: world 1 is forgiving, world 3's hairpins are very hard without it.

**On the road.**
- Yellow chevrons are **boost pads** (1.2 s boost).
- **Item boxes** (`?`, race mode only) respawn after 5 s.
- World 2 has moving **wind gates** and world 3 has static **blocks**; hitting one cuts your speed to 45 %.
- World 1 slows you on the grass. On the sky track (world 2) and the lava bridges (world 3), leaving the road means a **fall**: you respawn on the racing line after about a second.
- 3 laps. In a race you start 4th of 6 and bots rubber-band so the pack stays close.

## Features

### Game modes
- **Practice**: endless solo driving on the track you've selected, with item boxes and no countdown. Nothing is timed, recorded or unlocked, so it's the place to get used to the controls, the HUD and the items. **All three worlds are open in Practice** even if you haven't unlocked them for racing (switching back to Race or Time Trial drops you to your highest unlocked world).
- **Race**: 3 laps against 5 bots (CyberBot-01, NeonViper, GlitchRider, ByteBlaze, ChromeFang, PulseNova pool), with item boxes. Finishing in the top 3 unlocks the next world.
- **Time Trial**: solo, no bots or items, racing your own best-lap **ghost** for that kart (the ghost is Time Trial only; in a race it would look like a car restarting at the line every lap). Its times go on the global **Time Trial** leaderboard (races have their own board).
- **Daily challenge**: one track per UTC day for everyone (the world rotates 1 → 2 → 3, the seed is derived from the date), played as a Time Trial. Because everyone gets the same seed, the leaderboard for that seed *is* the daily board. The menu card shows your best, the time until the reset, a ✅ once done and a 🔥 streak of consecutive days.


### Track map and road ahead

Two panels sit under the pause button during a run. The **track map** shows the whole lap with every kart as a coloured dot carrying its race position: the leader is outlined in gold, **your dot glows**, your ghost is a dashed *G*, and the stretch just ahead of you is highlighted. **Road ahead** draws the next ~300 m with boost pads, item boxes, wind and hazards, plus a label such as *Hairpin left · in 80 m* (*then right* for S-bends). The map is a schematic built from the track's curvature (`src/game/minimap.ts`) and the look-ahead scans the real segments (`src/game/lookahead.ts`). Item-box rows (orange diamonds) and boost pads (yellow bars) are marked on the map, and a pack bunched at the start is spread out so every number stays readable. **Tap the panels during a race** to cycle Full → Compact → Off (a small *Map* chip stays so you can bring them back); the choice is remembered and also lives in Settings → Graphics. The panels hide while a tutorial card is open.

### Tutorial
A guided lap on an easy fixed track (world 1, seed 4242), run in endless Practice mode with lesson cards on top. The cards watch what you actually do and move on when you've done it: **steer** left and right → **drift** through a turn (hold DRIFT) → **let go to boost** (a boost pad doesn't count, it has to come from releasing a drift) → **grab an item** and use it. Every lesson has a *Skip this step* link and the whole thing can be dismissed with the × (you stay on the practice track). The controls glow when they're the thing to use. The step logic is a pure state machine (`src/utils/tutorial.ts`) and a test drives the real engine through all four lessons on the tutorial track.

### Worlds and progression

| # | World | Tier | Road | Curves | Lap (≈) | Notes |
|---|---|---|---|---|---|---|
| 1 | Neon Megacity | Beginner | wide | gentle (max 3) | 1500 segments, ~40 s | grass slows you; night city with shop fronts, crowds, palms and banner arches |
| 2 | Cyber Stratosphere | Intermediate | medium | up to 5 | 1800 segments | sky track over a cloud sea, balloons, floating islands, light rings, moving wind gates, falls |
| 3 | Obsidian Core | Expert | narrow | up to 6.5 incl. hairpins | 2000 segments | lava-lit bridges, volcanoes, brazier torches, steel gantries, barrier blocks, falls |

World 1 is open; world 2 unlocks with a podium finish (top 3) in world 1, and world 3 with a podium in world 2. A challenge link or the daily challenge opens its world regardless. Progress, medals and the daily streak are stored on the device and can be synced with [cloud save](#cloud-save).

### Karts

| Kart | Top speed | Acceleration | Turning | Drift charge | Character |
|---|---|---|---|---|---|
| Comet | 1.00 | 1.00 | 1.00 | 1.00 | balanced all-rounder |
| Rocket | 1.06 | 0.85 | 0.88 | 1.00 | fast on straights, heavy in corners |
| Phantom | 0.97 | 1.10 | 1.10 | 1.35 | nimble, charges drifts quickly |

Each has its own silhouette in the race and a live preview in the picker. Ghosts are stored per world + seed + kart.

### Items (race mode)
🚀 **Turbo** (1.6 s boost) · 🛡️ **Shield** (7 s, absorbs one hit) · 🛢️ **Oil slick** (dropped behind you, lasts 14 s, spins whoever drives through it) · 🎯 **Homing missile** (locks the nearest kart ahead within ~14 000 units).

A hit spins you out for 1 s and cuts your speed to 40 %. Item odds depend on your position: leaders mostly get defence (shield, oil), the back of the pack mostly gets turbos and missiles. Bots collect and use items too (missiles only with a target ahead, oil only with a car behind). All item rolls come from a seeded generator, so a race is reproducible.

### Bots
Waypoint following along a precomputed racing line (`track.ts`), look-ahead lane changes around traffic, corner braking, and rubber-banding relative to the player (stronger in the final lap) so races stay close until the end. Pace and rubber-banding strength scale with the world.

### Seeded tracks and sharing
`?world=2&seed=98765` rebuilds the identical track on any device (mulberry32 PRNG, `src/utils/rng.ts`). The menu has a seed field, a dice button for a random seed and a copy-link button; the URL always reflects the selection. **Share Scorecard** copies an emoji race matrix (⬜ cars ahead, 🟦 you, ⬛ cars behind, one row per lap) with the lap times and a challenge link; on mobile it uses the native share sheet from the leaderboard modal. Time Trials share lap times instead.

### Leaderboard
Board modal with a **Race / Time Trial** switch (it opens on the mode you're playing) and two tabs: the current seed, and the best times across the world. Top 25 by best lap (one row per player per track), with your own rows highlighted and an editable name. It shows whether you are looking at the global board, or the offline fallback (your local times plus rival ghosts).

### UI and presentation
Apple-style glass interface: frosted panels (`rgba(255,255,255,0.08)` with a 28 px blur), 24 px squircle corners, the SF system font stack, Apple Blue `#007AFF` and neon pink `#FF2D55` on deep obsidian `#090D16`. Safe-area aware and thumb-first. Pseudo-3D road with hills, fog, particles, speed lines, spin-outs and screen shake.

### Graphics
Each world is dressed as a lively, saturated scene rather than a flat backdrop (`src/game/scene.ts`, `scenery.ts`, `gfx.ts`):

- **Neon Megacity**: a dusk sky with a cratered moon, search lights and fireworks, three parallax skyline layers with lit windows and blinking rooftop beacons, a tiled pavement with a glowing kerb, street lamps arching over the road, shop fronts with striped awnings and neon signs, billboards, waving crowds behind barriers, glowing palms, bunting, and banner arches (a START arch with a checkered strip on the line).
- **Cyber Stratosphere**: a sunrise over a sea of cloud, aurora ribbons, soft puffy cloud banks, floating islands with waterfalls of light, hot-air balloons, wind turbines, crystal lanterns and glowing rings over the road.
- **Obsidian Core**: smoking volcanoes with lava falls, rising embers, a lava sea with glowing cracks, flame braziers lining the bridge, hazard-striped steel pylons and gantries, rocks veined with lava.
- **Karts** have outlined glossy bodies, chunky tyres, chrome exhausts, reflective visors and are drawn slightly larger than their hit box so they read on a phone.

Decoration comes from its own seeded random stream, so it never changes a track's layout (pads, boxes, hazards, replays and ghosts are unaffected). The static layers (sky, skylines, clouds, moon, sun) are painted once into offscreen canvases; the rest is drawn per frame. **Battery saver** drops the extra decoration (glows, fireworks, search lights, aurora, embers, window lights), and the game does the same by itself for the rest of the session if frames average slower than about 38 fps for a few seconds.

### Audio, haptics and PWA
- **Audio**: everything is synthesised live: engine tone that follows speed, drift hiss, countdown, pickups, hits, lap and finish jingles, and a procedural synthwave loop with a different tempo and scale per world.
- **Haptics**: vibration for drift levels, boosts, pads, hits, falls, laps and the finish (browsers that support `navigator.vibrate`, so not iOS Safari).
- **PWA**: installable (fullscreen, portrait manifest and icons) with an offline service worker (network-first pages, cache-first assets, `sw.js` is served `no-cache`).

## Settings

Gear icon on the menu, or **Settings** in the pause menu (the **?** button next to it opens the controls guide):

| Section | Options |
|---|---|
| Help | replay the tutorial, controls guide, practice mode (the tutorial and practice are disabled while a race is in progress) |
| Audio | sound on/off, music volume, effects volume |
| Controls | steering sensitivity (how far to drag for full lock), vibration |
| Graphics | battery saver (lower render resolution), screen shake, race panels: **Full** (map + road ahead), **Compact** (small map + bend call-out) or **Off** |
| Profile | player name (shown on the leaderboard) |
| Cloud save | turn on / copy your sync code, restore from a code, stop syncing |
| Data | reset progress on this device |

Volumes apply immediately; battery saver and screen shake apply from the next race.

## Configuration

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | Vercel, server-side | Neon connection string. The Neon integration injects it into the project. Used by the three API functions. |
| `VITE_API_BASE` | build time, optional | Base URL for API calls from the client (default: same origin). The bundled functions don't send CORS headers, so this only helps if you put them behind your own CORS-enabled host. |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (or `VERCEL_ORG_ID`) | GitHub Actions **secrets**, and your shell for local deploys | Used by the deployment cleanup. Omit the team id for a personal account. |
| `KEEP_DEPLOYMENT`, `KEEP_SHA`, `WAIT_MINUTES` | cleanup script | Which deployment to keep (see [Deployment](#deployment)); `WAIT_MINUTES` defaults to 12 with `KEEP_SHA`. |

There is no `.env` to create for local play.

### Data stored on the device (`localStorage`)

| Key | Contents |
|---|---|
| `turbodrift.settings.v1` | the settings above |
| `turbodrift.progress.v1` | unlocked world, best finish per world |
| `turbodrift.scores.v1` | your local lap records (up to 200) |
| `turbodrift.ghost.v2.<world>.<seed>.<kart>` | best-lap ghost |
| `turbodrift.daily.v1` | completed daily-challenge dates |
| `turbodrift.tutorial.v1` | whether the tutorial was completed or skipped (controls the first-race prompt) |
| `turbodrift.kart`, `turbodrift.mode`, `turbodrift.name`, `turbodrift.haptics` | last choices |
| `turbodrift.client` | random device id used for the leaderboard (not personal data) |
| `turbodrift.pending.v1` | races and time trials waiting to be submitted |
| `turbodrift.synccode` | your cloud-save code, if enabled |

### Database
Two tables, created automatically on the first API request (`db/schema.sql` is a reference copy): `scores` (one row per device + world + seed + mode, keeping the best times; `mode` is `race` or `trial`, and older rows are time trials, added automatically) and `saves` (cloud saves keyed by sync code). No migration step.

## Architecture

```
src/
  game/        engine.ts  fixed-step simulation, bots, items, rendering loop
               track.ts   seeded track generation (curves, hills, pads, hazards, item boxes, racing line)
               draw.ts    canvas drawing: backdrop, scenery, karts, boxes, props
               worlds.ts  world configs   karts.ts  kart stats   items.ts  items and odds
               replay.ts  input recording (run-length encoded)   verify.ts  server-side replay verification
  audio/       synth.ts   Web Audio synthesiser
  components/  Menu, RaceScreen (HUD + controls), Results, LeaderboardModal, SettingsModal, KartPreview
  utils/       rng, daily, ghost, leaderboard (+ offline queue), cloud, progress, settings, haptics, share, api
api/           score.ts  leaderboard.ts  save.ts  (Vercel Functions); _core.ts / _save.ts hold the logic
db/schema.sql  scripts/  (deploy + deployment cleanup)  tests/
```

Notes:
- **Rendering** is the classic pseudo-3D "segment" projection onto a 2D canvas, with sprites drawn far to near and clipped by hills.
- **Simulation** runs at a fixed 60 Hz regardless of frame rate. The same engine runs headlessly on the server for verification, which is why `engine.ts` has no hard DOM dependency.
- **API logic** (`_core.ts`, `_save.ts`) takes a tagged-template `sql` function, so the same code runs on Neon in production and on an in-memory Postgres in tests.

## Leaderboard, anti-cheat and cloud save

### Server-verified times
A Race or Time Trial records your steering and drift inputs, plus the moments you pressed the item button in a race (about 20 KB for a full race). The client submits **only that recording**, never a time. `api/score.ts` re-runs the real game engine headlessly with those inputs (`src/game/verify.ts`) and stores the times *the simulation* produced, so a tampered client can't claim a lap it didn't drive. A replay is rejected if it is malformed, doesn't finish 3 laps, or gives a lap faster than a per-world physical limit. Each device is limited to one submission per 45 s.

Races are replayed too: the engine is deterministic (bots, items and rubber-banding all run from the track seed), so the server re-runs the whole race, bots included, from your inputs and item presses (well under a second). Races and time trials rank on **separate boards**, and both still count for local records; races also drive world unlocks.

### Offline queue
Runs that can't be submitted (offline, server error, throttled) are queued on the device (up to 10, kept 7 days) and retried on launch, when the browser comes back online and after your next run, in order and without duplicates. A definitive rejection (a 4xx other than 429) drops the entry.

### Cloud save
Turn it on in Settings → Cloud save to get a secret 12-character sync code (no account). Enter it on another device to restore unlocks, medals, daily streak, name and kart. Merging only ever moves progress **forward** (highest unlock, best finish per world, union of days), so a stale device can't undo an unlock. Creating a save is throttled per IP (one per minute). Anyone with the code can read and update that save, so treat it like a password.

## HTTP API

All endpoints return JSON with `Cache-Control: no-store`; errors are `{ "error": "<message>" }`.

| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /api/leaderboard` | `?world=1..3`, optional `&seed=N` and `&mode=race\|trial` (default `trial`) | `[{ name, lap_ms, total_ms, world, seed }]` (top 25) | 400 bad world/seed, 503 |
| `POST /api/score` | `{ clientId, name, replay }` | `{ ok: true, lapMs, totalMs }` (the **server's** times) | 400 invalid or unverifiable replay, 429 slow down, 503 |
| `POST /api/save` | `{ unlocked, medals, days, name, kart }` | `{ code, save }` | 400 bad save, 429 slow down, 503 |
| `GET /api/save` | `?code=XXXX-XXXX-XXXX` (case and dashes forgiven) | `{ save }` | 400 bad code, 404 unknown code, 503 |
| `PUT /api/save` | `{ code, save }` | `{ save }` (merged, never lower) | 400, 404, 503 |

`replay` is `{ v: 1, world, seed, kart, steps, data, mode?, items? }` (`mode` is `race` or `trial`, default `trial`; `items` lists the steps at which the item button was pressed, races only), where `data` is base64 of run-length-encoded inputs (see `src/game/replay.ts`).

## Testing

```bash
npm test             # vitest run
npm run typecheck
```

156 tests in `tests/` (they also run in CI):

| File | Covers |
|---|---|
| `rng`, `track` | seeded determinism, closed loops, per-world limits, hazards, pads and item boxes, the API's lap-time floor versus game physics |
| `race` | headless full races in every world (bots stay close, falls, determinism), Time Trial, kart differences, item hits, shield and oil behaviour |
| `api` | replay verification (exact reproduction, tampering, malformed or unfinished recordings), server-computed times, throttling, best-time upsert, board queries |
| `save`, `cloud` | save validation, sync codes, forward-only merging, device A → device B restore through the real API logic |
| `queue` | offline queue: retries, ordering, throttling, concurrency, expiry, regression for the launch-time flush |
| `tutorial` | the lesson state machine (including that a boost pad can't pass the boost lesson), first-run flag, practice mode being endless and leaving no records, and every lesson being completable on the tutorial track |
| `minimap`, `lookahead`, `hud`, `settings` | closed non-pinching track maps for every world and seed, bend detection (direction, severity, distance, S-bends, wrap past the finish), map marks and dot spreading, the HUD's racer markers (one *you*, unique positions) and the panel setting |
| `race-board` | race submissions: the server re-runs a whole race with bots and items and matches the client, separate race / time-trial boards, item-press validation, the database upgrade from the old schema, plausibility floors with item turbos |
| `touch` | touch steering curve, dead zone and smoothing, arrow pads, the touch settings, and drift assist (starts drifts in bends, boosts, and is recorded so the server reproduces it) |
| `layout` | golden fingerprints: the road, pads, hazards and item boxes of 12 world+seed tracks never change |
| `render` | every sprite, backdrop, kart, hazard and prop draws without non-finite numbers or the negative radii that make a browser throw, at every distance, world and variation, in both full and trimmed (lite) modes; the decoration never alters the layout |
| `ghost`, `daily`, `items`, `format-share`, `cleanup` | ghosts per kart and settings, daily rotation and streaks, item odds and kart stats, scorecard text, deployment selection |

API tests run against an in-memory Postgres ([PGlite](https://pglite.dev)), so no database is needed.

## Deployment

The project deploys to **Vercel** with the **Neon** integration, **production only and latest only**:

- `vercel.json` skips every build that isn't on `main` (`ignoreCommand`), so **preview deployments are never created**.
- On every push to `main`, `.github/workflows/cleanup-deployments.yml` waits for the production deployment built from that commit to become `READY` and then runs `scripts/cleanup-deployments.mjs`, which deletes **all older deployments** and keeps only the latest. It refuses to delete anything unless the deployment to keep is found and `READY`, aborts if that build fails, and never touches anything newer. (Vercel's integration reports through commit statuses rather than GitHub Deployments, so a `deployment_status` trigger can't be used.)
- **Required GitHub Actions secrets** (Settings → Secrets and variables → Actions → *Secrets*): `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` (or `VERCEL_ORG_ID`). Without the token and project id the job logs a warning and does nothing. Run it manually from Actions → *Keep only the latest deployment* → Run workflow.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every pull request and on `main`.

Manual deploy and cleanup:

```bash
npx vercel link                 # once
npm run deploy                  # always --prod, then removes older deployments

# preview what the cleanup would delete
KEEP_SHA=<commit> npm run cleanup:deployments -- --dry-run      # keep the production deployment of a commit
KEEP_DEPLOYMENT=<dpl_id|url> npm run cleanup:deployments -- --dry-run
```

## Known limits
- **Cheating:** verification proves the recorded inputs produce the stored time, not that a human produced them. A program that *drives* well still passes, and a recording could be re-submitted under another name. Closing that needs per-player signing or accounts.
- **Cross-device floats:** the server's replay can differ by a few milliseconds from what a different browser engine displayed; the server's number is what is stored.
- **Unlocks** earned in races are trust-based (races aren't verifiable), and anyone with a sync code can read and update that save.
- **Karts:** the global board mixes karts (the database doesn't record which kart set a time).
- **Local development** has no API; test the server code with `npm test`.
- Not yet play-tested on a wide range of real phones: touch feel, audio, vibration and balance (item frequency, missile strength, kart differences) may need tuning.
