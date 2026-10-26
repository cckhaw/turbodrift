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
`?world=2&seed=98765` rebuilds the identical track (`src/utils/rng.ts`, mulberry32). "Share Scorecard" copies an emoji race matrix and the challenge link.

**Global leaderboard (Supabase).**
1. Create a Supabase project and run `supabase/migrations/001_scores.sql` in the SQL editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`; on Vercel add them as Production env vars).

How it is protected: the browser can only read the `leaderboard` view and call `submit_score`. It has no direct table access, so scores can't be edited or deleted. `submit_score` rejects lap times faster than a per-world physical limit (`world_limits`), sanitises the name, and keeps one row per device/world/seed that only ever improves. This stops casual tampering, not a determined cheater: times are reported by the client and there is no server-side replay check or rate limit.

Without the env vars (or when offline) the board falls back to `localStorage` plus deterministic rival ghosts, and failed submissions are retried on the next launch.

## Deployment: production only, latest only
- `vercel.json` skips every build that is not on `main` (`ignoreCommand`), so **preview deployments are never created**.
- After a production deployment succeeds, `.github/workflows/cleanup-deployments.yml` (or `npm run deploy` locally) runs `scripts/cleanup-deployments.mjs`, which deletes **all older deployments** and keeps only the latest. It refuses to delete anything unless the new deployment is found and `READY`.
- Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (omit for a personal account).
- Manual deploy: `npx vercel link` once, then `npm run deploy` (always `--prod`). Preview with `npm run cleanup:deployments -- --dry-run` (set `KEEP_DEPLOYMENT`).
