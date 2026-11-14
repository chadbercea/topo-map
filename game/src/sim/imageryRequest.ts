import type { GameState } from './state';
import type { MapEvent } from './events';
import type { System } from './systems';
import { settled, waiting } from './intel';

// ALPHA asks for imagery and holds (ILI-1532): short of a square without fresh intel, it asks HQ
// for imagery of it. The ask is an event card in COMMS (tap it: ORION-3 goes there) and a marker on the
// map. One at a time; a photo, burst or video of the square answers it. So there's always
// something HQ can do, and it says where.

export const IMAGERY_REQUEST = 'imagery-';
export const isImageryRequest = (e: MapEvent) => e.kind === 'request' && e.id.startsWith(IMAGERY_REQUEST);

// Holding short of a square for want of fresh intel.
export const needsImagery = (s: GameState) => s.team.activity === 'Holding · needs intel';

// The square it's holding short of, unless fresh intel on it is already on the shelf for ALPHA.
export function requestSquare(s: GameState): string | undefined {
  const next = s.team.route[s.team.waypoint];
  return next && !settled(s, next) && !waiting(s, next) ? next : undefined;
}

// HQ's look at the square since ALPHA asked: ORION-3's, not ALPHA's own eyes on it as it walks up.
// An Analyze posts its package on the shelf (ILI-1499): that answers it. ALPHA pulls it itself.
const answered = (s: GameState, e: MapEvent) => {
  const snap = s.imagery[e.square];
  return !!snap && snap.mode !== 'eyes' && snap.atMs >= e.atMs;
};

export const openImageryRequest = (s: GameState) => s.events.find((e) => isImageryRequest(e) && e.status !== 'resolved');

export const imageryRequestSystem: System = (s) => {
  const open = openImageryRequest(s);
  if (open) return answered(s, open) ? { ...s, events: s.events.map((e) => (e === open ? { ...e, status: 'resolved' as const } : e)) } : s;
  if (!needsImagery(s)) return s;
  const square = requestSquare(s);
  if (!square) return s;
  const ask: MapEvent = { id: `${IMAGERY_REQUEST}${square}-${s.elapsedMs}`, kind: 'request', square, title: `${s.team.callsign} requested imagery of ${square}`, atMs: s.elapsedMs, status: 'new' };
  return { ...s, events: [...s.events, ask] };
};
