import { getBoard } from './_core.js';
import { getSql, json } from './_db.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const q = new URL(request.url).searchParams;
    const r = await getBoard(getSql(), q.get('world'), q.get('seed'), q.get('mode'), q.get('laps'));
    return json(r.body, r.status);
  } catch (e) {
    console.error('leaderboard', e);
    return json({ error: 'unavailable' }, 503);
  }
}
