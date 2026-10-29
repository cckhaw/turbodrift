import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { getBoard, renamePlayer, type Sql } from '../api/_core';
import { isCleanName } from '../src/utils/profanity';

describe('name filter', () => {
  it('lets ordinary names through, including ones that merely contain a short bad word', () => {
    for (const n of ['Mika', 'Turbo Fox', 'DriftKing', 'Classic', 'Assassin', 'Scunthorpe', 'Title Run', 'Dickson', 'Cumberland', 'Hoegaarden', 'Sussex', 'Kai-9', 'Ace_Racer', '速度', 'Zoë', 'YOU', 'Nigel', 'Spicy', 'Pedometer', 'Wankel', 'Nazim', 'as', 'Passion']) expect(isCleanName(n), n).toBe(true);
  });

  it('catches the word however it is dressed up', () => {
    for (const n of ['fuck', 'FUCK', 'x_fuck_x', 'f u c k', 'f.u.c.k', 'fuuuck', 'sh1t', 'b!tch', 'Sh!tHead', 'c0ck', 'a s s', 'ASS', 'big ass', 'n1gger', 'N1GG3R', 'h1tler', 'p0rn', 'dumb@ss', 'D1CK']) expect(isCleanName(n), n).toBe(false);
  });
});

describe('name filter on the server', () => {
  const db = new PGlite();
  const sql: Sql = async (s, ...v) => {
    let text = s[0];
    for (let i = 0; i < v.length; i++) text += `$${i + 1}` + s[i + 1];
    return (await db.query(text, v as unknown[])).rows as never[];
  };
  const A = '11111111-1111-4111-8111-111111111111';

  it('refuses to rename a device to a name that is not allowed, and keeps the old one', async () => {
    await getBoard(sql, '1', null);
    await sql`insert into scores (client_id, name, world, seed, mode, laps, lap_ms, total_ms) values (${A}, 'Mika', 1, 5, 'race', 3, 40000, 125000)`;
    const r = await renamePlayer(sql, { clientId: A, name: 'sh1thead' });
    expect(r.status).toBe(400);
    expect(((await getBoard(sql, '1', null, 'race', '3')).body as { name: string }[])[0].name).toBe('Mika');
    expect((await renamePlayer(sql, { clientId: A, name: 'Mika II' })).status).toBe(200);
  });
});
