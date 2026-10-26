import type { SquareId } from '../map/grid';
import type { System } from './systems';

// Things that happen on the map and want the player's attention. Each one sits on a grid
// square; tapping its marker opens it, and later it routes to a decision point or mini game.

export type EventKind = 'contact' | 'request';
export type EventStatus = 'new' | 'seen' | 'resolved';

export type MapEvent = {
  id: string;
  kind: EventKind;
  square: SquareId;
  title: string;
  atMs: number; // mission time it appeared
  status: EventStatus;
};

export type Scheduled = { atMs: number; event: Omit<MapEvent, 'atMs' | 'status'> };

// Placeholder schedule until the mission script lands (ILI-1139).
export const DEMO_SCHEDULE: Scheduled[] = [
  { atMs: 15_000, event: { id: 'contact-e3', kind: 'contact', square: 'E3', title: 'Unknown contact' } },
  { atMs: 45_000, event: { id: 'request-c2', kind: 'request', square: 'C2', title: 'ALPHA requests imagery' } },
];

export const eventSystem: System = (s) => {
  const due = s.schedule.filter((x) => x.atMs <= s.elapsedMs);
  if (!due.length) return s;
  return {
    ...s,
    schedule: s.schedule.filter((x) => x.atMs > s.elapsedMs),
    events: [...s.events, ...due.map((x) => ({ ...x.event, atMs: s.elapsedMs, status: 'new' as const }))],
  };
};
