import type { SquareId } from '../map/grid';
import type { System } from './systems';

// Things that happen on the map and want the player's attention. Each one sits on a grid
// square; tapping its marker opens it, and later it routes to a decision point or mini game.

export type EventKind = 'contact' | 'request' | 'site' | 'signal'; // site: a kill site; signal: enemy radio traffic
export type EventStatus = 'new' | 'seen' | 'resolved';

export type MapEvent = {
  id: string;
  kind: EventKind;
  square: SquareId;
  title: string;
  atMs: number; // mission time it appeared
  status: EventStatus;
};

export type Scheduled = { atMs: number; event: Omit<MapEvent, 'atMs' | 'status'>; radio?: string }; // radio: HQ flags it

// Scheduled events, placeholders until the mission script (ILI-1139). Contacts come from
// imagery (contacts.ts); enemy radio traffic is scheduled.
export const DEMO_SCHEDULE: Scheduled[] = [
  { atMs: 50_000, event: { id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic' }, radio: 'Picking up enemy radio traffic near C2. Intercept it?' },
];

export const eventSystem: System = (s) => {
  const due = s.schedule.filter((x) => x.atMs <= s.elapsedMs);
  if (!due.length) return s;
  const radio = due.filter((x) => x.radio).map((x) => ({ id: `hq-${x.event.id}`, from: 'HQ', text: x.radio!, atMs: s.elapsedMs, status: 'new' as const, holds: false }));
  return {
    ...s,
    schedule: s.schedule.filter((x) => x.atMs > s.elapsedMs),
    events: [...s.events, ...due.map((x) => ({ ...x.event, atMs: s.elapsedMs, status: 'new' as const }))],
    comms: radio.length ? { ...s.comms, minimized: false, messages: [...s.comms.messages, ...radio] } : s.comms,
  };
};
