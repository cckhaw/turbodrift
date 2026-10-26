# Turbo Drift: Neon Circuit

Mobile-first arcade kart racer for the browser. React + Vite + Canvas (pseudo-3D) + Tailwind + Web Audio. No assets, no install.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## How to play
- **Steer:** drag your thumb left/right anywhere on screen (arrow keys / A-D on desktop). The kart accelerates automatically.
- **Drift / boost:** hold the DRIFT button (bottom-right, `Space`/`Shift` on desktop) while steering into a turn. Hold until the ring turns blue → pink, release for a mini-turbo. Hard corners in worlds 2–3 are very hard to take without drifting.
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
`?world=2&seed=98765` rebuilds the identical track (`src/utils/rng.ts`, mulberry32). The leaderboard is stored in `localStorage` and padded with deterministic rival ghosts. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to also read/write a Supabase `scores` table (`name text, lap_ms int, total_ms int, world int, seed int`). "Share Scorecard" copies an emoji race matrix and the challenge link.

## Deployment: production only, latest only
- `vercel.json` skips every build that is not on `main` (`ignoreCommand`), so **preview deployments are never created**.
- After a production deployment succeeds, `.github/workflows/cleanup-deployments.yml` (or `npm run deploy` locally) runs `scripts/cleanup-deployments.mjs`, which deletes **all older deployments** and keeps only the latest. It refuses to delete anything unless the new deployment is found and `READY`.
- Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (omit for a personal account).
- Manual deploy: `npx vercel link` once, then `npm run deploy` (always `--prod`). Preview with `npm run cleanup:deployments -- --dry-run` (set `KEEP_DEPLOYMENT`).
