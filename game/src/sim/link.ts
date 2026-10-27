import type { GameState } from './state';

// HQ's satcom link to the team (ILI-1186). The game opens with no link: ALPHA is deployed
// and operating, but HQ hasn't found it yet. A SITREP goes out over satcom, the team texts
// back its mission code name, and filtering the intel stream for that code name ties the
// team to its intel. That is the link, and the mission clock starts.

export type LinkState = 'none' | 'pinging' | 'replied' | 'linked';
export type Link = { state: LinkState; codename: string; atMs: number }; // atMs: theater time of the last change

export const REPLY_MS = 1_500; // the team's text back, in theater time

export const sitrepText = (s: GameState) => `${s.team.callsign}, HQ. SITREP, over.`;
export const replyText = (s: GameState) =>
  `HQ, ${s.team.callsign}. Operating under ${s.link.codename}. Boots on at ${s.team.route[0]}, five fit. Standing by for overwatch.`;

const norm = (t: string) => t.trim().toUpperCase().replace(/\s+/g, ' ');
export const isCodename = (s: GameState, text: string) => norm(text) === norm(s.link.codename);

export function sitrep(s: GameState): GameState {
  if (s.phase !== 'standby' || s.link.state !== 'none') return s;
  return { ...s, link: { ...s.link, state: 'pinging', atMs: s.theaterMs } };
}

// The team's reply comes in a moment after the SITREP.
export function linkSystem(s: GameState): GameState {
  if (s.link.state !== 'pinging' || s.theaterMs - s.link.atMs < REPLY_MS) return s;
  return { ...s, link: { ...s.link, state: 'replied', atMs: s.theaterMs } };
}

// The intel stream's filter. Filtering for the team's code name once it has given it links
// the team, and the mission begins.
export function setFilter(s: GameState, filter: string): GameState {
  const next = { ...s, stream: { ...s.stream, filter } };
  if (s.link.state !== 'replied' || !isCodename(s, filter)) return next;
  return { ...next, phase: 'running', link: { ...s.link, state: 'linked', atMs: s.theaterMs } };
}
