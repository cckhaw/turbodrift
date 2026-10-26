/* Leaderboard logic, independent of the HTTP layer and of the Postgres driver (takes a tagged-template `sql`). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

/** Fastest physically plausible lap per world: top speed with permanent boost, minus 10%. */
export const MIN_LAP_MS: Record<number, number> = { 1: 26000, 2: 30000, 3: 32000 };
const MAX_LAP_MS = 600000;
const MAX_TOTAL_MS = 3600000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A real race is 3 laps, so one device can't legitimately finish two races this close together. */
const THROTTLE_SECONDS = 45;

let ready: Promise<void> | null = null;

export function ensureSchema(sql: Sql): Promise<void> {
  ready ??= (async () => {
    await sql`create table if not exists scores (
      id          bigint generated always as identity primary key,
      client_id   uuid        not null,
      name        text        not null check (char_length(name) between 1 and 12),
      world       int         not null check (world between 1 and 3),
      seed        int         not null check (seed between 1 and 999999999),
      lap_ms      int         not null check (lap_ms between 1000 and 600000),
      total_ms    int         not null check (total_ms between 1000 and 3600000),
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      unique (client_id, world, seed)
    )`;
    await sql`create index if not exists scores_board_idx on scores (world, seed, lap_ms)`;
    await sql`create index if not exists scores_world_idx on scores (world, lap_ms)`;
  })().catch((e) => {
    ready = null; // retry on the next request
    throw e;
  });
  return ready;
}

export interface Result {
  status: number;
  body: unknown;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const bad = (error: string, status = 400): Result => ({ status, body: { error } });

export async function submitScore(sql: Sql, input: unknown): Promise<Result> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const { clientId, world, seed, lapMs, totalMs } = b;
  if (typeof clientId !== 'string' || !UUID.test(clientId)) return bad('bad client id');
  if (!isInt(world) || !(world in MIN_LAP_MS)) return bad('unknown world');
  if (!isInt(seed) || seed < 1 || seed > 999999999) return bad('bad seed');
  if (!isInt(lapMs) || !isInt(totalMs)) return bad('times must be integers');
  const min = MIN_LAP_MS[world];
  if (lapMs < min || lapMs > MAX_LAP_MS) return bad('implausible lap time');
  if (totalMs < lapMs + 2 * min || totalMs > MAX_TOTAL_MS) return bad('implausible race time');
  // eslint-disable-next-line no-control-regex
  let name = String(typeof b.name === 'string' ? b.name : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
  if (!name) name = 'YOU';

  await ensureSchema(sql);
  const recent = await sql`select 1 from scores where client_id = ${clientId} and updated_at > now() - make_interval(secs => ${THROTTLE_SECONDS}) limit 1`;
  if (recent.length) return bad('slow down', 429);

  await sql`insert into scores (client_id, name, world, seed, lap_ms, total_ms)
    values (${clientId}, ${name}, ${world}, ${seed}, ${lapMs}, ${totalMs})
    on conflict (client_id, world, seed) do update
      set name = excluded.name,
          lap_ms = least(scores.lap_ms, excluded.lap_ms),
          total_ms = least(scores.total_ms, excluded.total_ms),
          updated_at = now()`;
  return { status: 200, body: { ok: true } };
}

export async function getBoard(sql: Sql, worldParam: string | null, seedParam: string | null): Promise<Result> {
  const world = Number(worldParam);
  if (!isInt(world) || !(world in MIN_LAP_MS)) return bad('unknown world');
  const seed = seedParam == null || seedParam === '' ? null : Number(seedParam);
  if (seed !== null && (!isInt(seed) || seed < 1 || seed > 999999999)) return bad('bad seed');

  await ensureSchema(sql);
  const rows = await sql`select name, lap_ms, total_ms, world, seed from scores
    where world = ${world} and (${seed}::int is null or seed = ${seed})
    order by lap_ms asc limit 25`;
  return { status: 200, body: rows };
}
