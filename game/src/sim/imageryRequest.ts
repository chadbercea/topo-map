import type { GameState } from './state';
import type { MapEvent } from './events';
import type { System } from './systems';
import { gauge, LOW_AT } from './intel';

// The never-stuck rule (option D, ILI-1349): when ALPHA is running low on intel on the move, or
// holding because it's out, it asks HQ for imagery of the next square on its route nobody has
// scanned. The ask is an event card in COMMS (tap it: ORION-3 goes there) and a marker on the
// map. One at a time; a photo, burst or video of the square answers it. So there's always
// something HQ can do, and it says where.

export const IMAGERY_REQUEST = 'imagery-';
export const isImageryRequest = (e: MapEvent) => e.kind === 'request' && e.id.startsWith(IMAGERY_REQUEST);

// Running low, or out and holding for it.
export const needsImagery = (s: GameState) => s.team.activity === 'Holding · needs intel' || (s.team.activity.startsWith('Moving') && gauge(s) < LOW_AT);

// The next square on ALPHA's way the analysts haven't been through. One scan settles a square
// (ILI-1399): never one already scanned, so HQ is never asked to look twice.
export function requestSquare(s: GameState): string | undefined {
  const route = s.team.route.slice(s.team.waypoint);
  return route.find((sq) => !s.map.scanned.includes(sq) && !s.intel.graded.includes(sq));
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
