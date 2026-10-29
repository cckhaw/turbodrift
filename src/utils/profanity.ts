/**
 * A small profanity filter for leaderboard names. It runs on the device (so the player gets an answer straight away)
 * and again on the server, which is the one that counts.
 *
 * Long, unambiguous words match anywhere in the name, so "x_FUCK_x" and "sh1t" are caught. Short words that appear
 * inside innocent ones (ass in "class", tit in "title") only match as a whole word.
 */

const SUBSTRING = [
  'fuck', 'shit', 'bitch', 'nigg', 'fagg', 'retard', 'whore', 'slut', 'bastard', 'twat', 'bollock', 'dildo', 'penis', 'vagina', 'blowjob', 'handjob', 'jizz', 'rapist', 'hitler', 'kike', 'chink', 'tranny', 'molest', 'pedoph', 'porn', 'asshole', 'dumbass', 'jackass',
];
const WHOLE_WORD = ['ass', 'arse', 'cock', 'dick', 'piss', 'tit', 'tits', 'cum', 'fag', 'hoe', 'rape', 'anus', 'sex', 'fck', 'fuk', 'shyt', 'cnt', 'cunt', 'cunts', 'dyke', 'coon', 'paki', 'gook', 'wop', 'kys', 'spic', 'nazi', 'pedo', 'wank'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

const fold = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0134578@$!|+]/g, (c) => LEET[c] ?? c);

/** "fuck" → /f+u+c+k+/, so stretched spellings ("fuuuck") match but "Nigel" doesn't match "nigg". */
const stretch = (w: string): string => [...w].map((c) => `${c}+`).join('');
const SUB_RE = new RegExp(SUBSTRING.map(stretch).join('|'));
const WHOLE_RE = new RegExp(`^(?:${WHOLE_WORD.map(stretch).join('|')})$`);

/** Is this name fine to put on a public board? */
export function isCleanName(name: string): boolean {
  const folded = fold(name);
  // letters only: "f u c k" and "f.u.c.k" become "fuck"
  const squashed = folded.replace(/[^a-z]/g, '');
  if (SUB_RE.test(squashed)) return false;
  // short words only count on their own, so "class" and "title" are fine
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  return !words.some((w) => WHOLE_RE.test(w)) && !WHOLE_RE.test(squashed);
}
