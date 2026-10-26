import type { SquareId } from '../map/grid';
import type { System } from './systems';

// Things that happen on the map and want the player's attention. Each one sits on a grid
// square; tapping its marker opens it, and later it routes to a decision point or mini game.

export type EventKind = 'contact' | 'request' | 'site'; // site: a kill site to search
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

// Scheduled events for the mission script (ILI-1139). Contacts now come from imagery
// (contacts.ts), so nothing is scheduled yet.
export const DEMO_SCHEDULE: Scheduled[] = [];

export const eventSystem: System = (s) => {
  const due = s.schedule.filter((x) => x.atMs <= s.elapsedMs);
  if (!due.length) return s;
  return {
    ...s,
    schedule: s.schedule.filter((x) => x.atMs > s.elapsedMs),
    events: [...s.events, ...due.map((x) => ({ ...x.event, atMs: s.elapsedMs, status: 'new' as const }))],
  };
};
