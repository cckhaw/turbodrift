/* Leaderboard logic, independent of the HTTP layer and of the Postgres driver (takes a tagged-template `sql`). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

/** Fastest physically plausible lap per world: top speed with permanent boost, minus 10%. */
export const MIN_LAP_MS: Record<number, number> = { 1: 26000, 2: 30000, 3: 32000, 4: 28000, 5: 33000 };
const MAX_LAP_MS = 600000;
const MAX_TOTAL_MS = 3600000;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Even a one-lap race plus its countdown takes longer than this, so one device can't legitimately finish two this close together. */
const THROTTLE_SECONDS = 20;

/** schema setup runs once per connection/function (so a test database or a fresh deploy gets its own) */
const readyBy = new WeakMap<Sql, Promise<void>>();

export function ensureSchema(sql: Sql): Promise<void> {
  const known = readyBy.get(sql);
  if (known) return known;
  const ready = (async () => {
    await sql`create table if not exists scores (
      id          bigint generated always as identity primary key,
      client_id   uuid        not null,
      name        text        not null check (char_length(name) between 1 and 12),
      world       int         not null,
      seed        int         not null check (seed between 1 and 999999999),
      lap_ms      int         not null check (lap_ms between 1000 and 600000),
      total_ms    int         not null check (total_ms between 1000 and 3600000),
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      unique (client_id, world, seed)
    )`;
    // the world range used to be a column check (1..3); worlds are validated in code now so new ones need no migration
    await sql`alter table scores drop constraint if exists scores_world_check`;
    // races and time trials rank separately (older rows are all time trials)
    await sql`alter table scores add column if not exists mode text not null default 'trial'`;
    await sql`alter table scores drop constraint if exists scores_client_id_world_seed_key`;
    // each lap count (1, 2 or 3) has its own board
    await sql`alter table scores add column if not exists laps int not null default 3`;
    await sql`drop index if exists scores_client_track_mode_idx`;
    await sql`create unique index if not exists scores_client_track_mode_laps_idx on scores (client_id, world, seed, mode, laps)`;
    await sql`create index if not exists scores_board_idx on scores (world, seed, lap_ms)`;
    await sql`create index if not exists scores_world_idx on scores (world, lap_ms)`;
    await sql`create index if not exists scores_total_idx on scores (world, mode, laps, total_ms)`;
    await sql`create table if not exists saves (
      code        text        primary key,
      data        jsonb       not null,
      ip_hash     text,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    )`;
    await sql`create index if not exists saves_ip_idx on saves (ip_hash, created_at)`;
  })().catch((e) => {
    readyBy.delete(sql); // retry on the next request
    throw e;
  });
  readyBy.set(sql, ready);
  return ready;
}

export interface Result {
  status: number;
  body: unknown;
}

const bad = (error: string, status = 400): Result => ({ status, body: { error } });

/** What the verifier must return; see src/game/verify.ts. */
export type Verifier = (replay: unknown) => { ok: false; error: string } | { ok: true; world: number; seed: number; mode: 'trial' | 'race'; laps: number; lapMs: number; totalMs: number; lapTimes: number[] };

/**
 * The client sends only its identity, name and an input replay. The server re-simulates the race and stores the
 * times the simulation produced, so a tampered client can't claim a time it didn't drive.
 */
export async function submitScore(sql: Sql, input: unknown, verify: Verifier): Promise<Result> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const { clientId } = b;
  if (typeof clientId !== 'string' || !UUID.test(clientId)) return bad('bad client id');

  const v = verify(b.replay);
  if (!v.ok) return bad(v.error);
  const { world, seed, mode, laps, lapMs, totalMs } = v;
  const min = MIN_LAP_MS[world];
  if (!min || lapMs < min || lapMs > MAX_LAP_MS) return bad('implausible lap time');
  if (totalMs < lapMs + (laps - 1) * min || totalMs > MAX_TOTAL_MS) return bad('implausible race time');
  // eslint-disable-next-line no-control-regex
  let name = String(typeof b.name === 'string' ? b.name : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
  if (!name) name = 'YOU';

  await ensureSchema(sql);
  const recent = await sql`select 1 from scores where client_id = ${clientId} and updated_at > now() - make_interval(secs => ${THROTTLE_SECONDS}) limit 1`;
  if (recent.length) return bad('slow down', 429);

  await sql`insert into scores (client_id, name, world, seed, mode, laps, lap_ms, total_ms)
    values (${clientId}, ${name}, ${world}, ${seed}, ${mode}, ${laps}, ${lapMs}, ${totalMs})
    on conflict (client_id, world, seed, mode, laps) do update
      set name = excluded.name,
          lap_ms = least(scores.lap_ms, excluded.lap_ms),
          total_ms = least(scores.total_ms, excluded.total_ms),
          updated_at = now()`;
  return { status: 200, body: { ok: true, lapMs, totalMs } };
}

export async function getBoard(sql: Sql, worldParam: string | null, seedParam: string | null, modeParam: string | null = null, lapsParam: string | null = null): Promise<Result> {
  const mode = modeParam === 'race' ? 'race' : 'trial';
  const laps = lapsParam == null || lapsParam === '' ? 3 : Number(lapsParam);
  if (![1, 2, 3].includes(laps)) return bad('unknown lap count');
  const world = Number(worldParam);
  if (!isInt(world) || !(world in MIN_LAP_MS)) return bad('unknown world');
  const seed = seedParam == null || seedParam === '' ? null : Number(seedParam);
  if (seed !== null && (!isInt(seed) || seed < 1 || seed > 999999999)) return bad('bad seed');

  await ensureSchema(sql);
  const rows = await sql`select name, lap_ms, total_ms, world, seed from scores
    where world = ${world} and mode = ${mode} and laps = ${laps} and (${seed}::int is null or seed = ${seed})
    order by total_ms asc limit 25`;
  return { status: 200, body: rows };
}
