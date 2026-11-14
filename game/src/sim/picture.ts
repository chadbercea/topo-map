import type { SquareId } from '../map/grid';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';

// ALPHA's picture of the enemy (ILI-1495): what ALPHA itself knows, never the sim's ground truth.
// It only learns from intel it pulls off the shelf (ILI-1499), and from its own eyes:
// - an Analyze's package, once downloaded: what the analysts saw in that square (and who is no longer there);
// - a square on video, once ALPHA has pulled its feed: live to the team, for good (ILI-1432);
// - a decoded intercept HQ sends, when the intercept had a fix on them (ILI-1493);
// - a square it's in contact on;
// - a group it sees itself, in range and with no ground in the way (sight.ts, ILI-1512).
// Its route choices, holds and go-arounds read this, and only this.
export type Known = { square: SquareId; units: number; atMs: number };
export type Picture = Record<string, Known>; // by contact id

const live = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';

// HQ's look at a square, as the team gets it: who's in it, and the end of whatever ALPHA thought
// was there that isn't.
export function tell(s: GameState, square: SquareId): GameState {
  const snap = s.imagery[square];
  if (!snap) return s;
  const known: Picture = {};
  for (const [id, k] of Object.entries(s.team.known)) if (k.square !== square) known[id] = k;
  for (const seen of snap.seen) if (seen.units.length) known[seen.contactId] = { square, units: seen.units.length, atMs: snap.atMs };
  return { ...s, team: { ...s.team, known } };
}

// One contact, where ALPHA was told it is.
export const learn = (s: GameState, c: Contact, square: SquareId, units = c.units.length): GameState => ({
  ...s,
  team: { ...s.team, known: { ...s.team.known, [c.id]: { square, units, atMs: s.elapsedMs } } },
});

// The video feeds ALPHA has pulled keep its picture of their squares live.
const onFeed = (s: GameState, sq: string) => s.intel.pushes.some((p) => p.square === sq && p.grade === 'video' && p.state === 'fed');
export const pictureSystem: System = (s) => {
  let next = s;
  for (const sq of s.intel.live ?? []) {
    if (!onFeed(next, sq)) continue;
    const snap = next.imagery[sq];
    if (!snap) continue;
    const had = Object.entries(next.team.known).filter(([, k]) => k.square === sq);
    const same = had.length === snap.seen.filter((x) => x.units.length).length && snap.seen.every((x) => !x.units.length || next.team.known[x.contactId]?.square === sq && next.team.known[x.contactId].units === x.units.length);
    if (!same) next = tell(next, sq);
  }
  return next;
};

// What ALPHA knows is in a square: the contact, and how many fighters it was told about. A group
// HQ watched go down (a strike's damage assessment, or ALPHA's own fight) is gone from it, and
// fighters HQ saw fall come off.
export function knownTo(s: GameState, square: SquareId): { c: Contact; units: number } | undefined {
  for (const [id, k] of Object.entries(s.team.known)) {
    if (k.square !== square) continue;
    const c = s.contacts.find((x) => x.id === id);
    if (c && live(c) && c.units.length) return { c, units: Math.min(k.units, c.units.length) };
  }
  return undefined;
}
