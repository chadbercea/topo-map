import { CELL, parseSquare, squareAt, type SquareId } from '../map/grid';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';

// What HQ has seen, square by square (ILI-1167: fog of war both ways). Nothing in a square
// shows until someone looks: ORION-3, or ALPHA's own eyes in the square it stands in. Each
// look is a snapshot of who was there, and it ages: fresh, then a ghost of where they were,
// then a faint last-known mark. Video and ALPHA's eyes are live while they last.

export type CaptureMode = 'photo' | 'burst' | 'video';
export type Awareness = 'unaware' | 'suspicious' | 'alerted';

export type Seen = {
  contactId: string;
  x: number; // world position of the group's 4x4 cell grid (top left) when seen
  y: number;
  units: number[]; // the cells (4x4 over the square) its fighters were in
  to: SquareId | null; // where it was heading, if the look could tell (burst, video, eyes)
  awareness: Awareness;
};

export type Snapshot = {
  square: SquareId;
  atMs: number;
  mode: CaptureMode | 'eyes';
  seen: Seen[];
  live: boolean;
};

export const FRESH_MS = 20_000;
export const GHOST_MS = 60_000;
export type Freshness = 'live' | 'fresh' | 'ghost' | 'stale';

export const freshness = (snap: Snapshot, now: number): Freshness =>
  snap.live ? 'live' : now - snap.atMs < FRESH_MS ? 'fresh' : now - snap.atMs < GHOST_MS ? 'ghost' : 'stale';

// The enemy's picture of ALPHA: they know once they've been hit or the net is alerted, and
// they're uneasy once the PMC has been loud.
export const SUSPICIOUS_NOISE = 40;
export function awarenessOf(s: GameState, c: Contact): Awareness {
  if (s.alerted || c.units.length < c.total) return 'alerted';
  return s.noise >= SUSPICIOUS_NOISE ? 'suspicious' : 'unaware';
}

const alive = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';

const origin = (sq: SquareId) => {
  const p = parseSquare(sq)!;
  return { x: p.col * CELL, y: p.row * CELL };
};

// Where a contact's group is now: its square, or part-way to the next one.
export function groupOrigin(c: Contact, now: number) {
  const here = origin(c.square);
  if (!c.move) return here;
  const to = origin(c.move.to);
  const t = Math.min(1, Math.max(0, (now - c.move.fromMs) / Math.max(1, c.move.arriveMs - c.move.fromMs)));
  return { x: here.x + (to.x - here.x) * t, y: here.y + (to.y - here.y) * t };
}

// A look at a square: every live contact in it. A single photo can't tell who is moving.
export function snapshot(s: GameState, square: SquareId, mode: Snapshot['mode'], live: boolean): Snapshot {
  const seen = s.contacts
    .filter((c) => alive(c) && c.square === square && c.units.length)
    .map((c) => ({ contactId: c.id, ...groupOrigin(c, s.elapsedMs), units: [...c.units], to: mode === 'photo' ? null : (c.move?.to ?? null), awareness: awarenessOf(s, c) }));
  return { square, atMs: s.elapsedMs, mode, seen, live };
}

// Keep the newest look per square. A contact's map marker goes where it was last seen, not
// where it really is: the map only knows what someone saw.
export function record(s: GameState, snap: Snapshot): GameState {
  const ids = new Set(snap.seen.map((x) => x.contactId));
  return {
    ...s,
    imagery: { ...s.imagery, [snap.square]: snap },
    events: s.events.map((e) => (e.kind === 'contact' && ids.has(e.id.replace('contact-', '')) ? { ...e, square: snap.square } : e)),
  };
}

// ALPHA sees the square it's in, live; the look it leaves behind starts to age.
export const eyesSystem: System = (s) => {
  const here = squareAt(s.team.position.x, s.team.position.y);
  let next = s;
  for (const snap of Object.values(s.imagery))
    if (snap.mode === 'eyes' && snap.live && snap.square !== here) next = { ...next, imagery: { ...next.imagery, [snap.square]: { ...snap, live: false } } };
  if (!here) return next;
  const prev = next.imagery[here];
  const look = snapshot(next, here, 'eyes', true);
  // Nothing new to see: keep the same object so the map isn't redrawn for nothing.
  if (prev?.mode === 'eyes' && prev.live && JSON.stringify(prev.seen) === JSON.stringify(look.seen)) return next;
  return record(next, look);
};
