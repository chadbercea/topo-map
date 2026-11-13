import type { SquareId } from '../map/grid';
import type { System } from './systems';

// Things that happen on the map and want the player's attention. Each one sits on a grid
// square; tapping its marker opens it, and later it routes to a decision point or mini game.

export type EventKind = 'contact' | 'request' | 'site' | 'signal' | 'building'; // site: a kill site; signal: enemy radio traffic; building: worth a search (ILI-1316)
export type EventStatus = 'new' | 'seen' | 'resolved';

export type MapEvent = {
  id: string;
  kind: EventKind;
  square: SquareId;
  title: string;
  atMs: number; // mission time it appeared
  status: EventStatus;
};

// Something the mission script schedules: a map event, a radio line, or both. The radio
// comes from HQ unless from says 'team'.
export type Scheduled = { atMs: number; id: string; event?: Omit<MapEvent, 'atMs' | 'status'>; radio?: string; from?: 'team' | 'HQ'; alert?: boolean };

export const eventSystem: System = (s) => {
  const due = s.schedule.filter((x) => x.atMs <= s.elapsedMs);
  if (!due.length) return s;
  const radio = due
    .filter((x) => x.radio)
    .map((x) => ({ id: x.id, from: x.from === 'team' ? s.team.callsign : 'HQ', text: x.radio!, atMs: s.elapsedMs, status: 'new' as const, holds: false, alert: x.alert }));
  return {
    ...s,
    schedule: s.schedule.filter((x) => x.atMs > s.elapsedMs),
    events: [...s.events, ...due.filter((x) => x.event).map((x) => ({ ...x.event!, atMs: s.elapsedMs, status: 'new' as const }))],
    comms: radio.length ? { ...s.comms, messages: [...s.comms.messages, ...radio] } : s.comms,
  };
};

// Where events show (ILI-1519): only on ground ORION-3's analysts have been through. A square it
// has never analyzed shows nothing: no traffic tag, no contact, no building, no kill site. The one
// exception is the square ALPHA is in contact on: it reports what's shooting at it. ALPHA's own ask
// for imagery is the exception by nature: it marks ground nobody has looked at yet.
type Sight = { intel: { graded: readonly string[] }; team: { fight?: { square: SquareId } | null } };
export const eventShown = (s: Sight, e: Pick<MapEvent, 'kind' | 'square'>) =>
  e.kind === 'request' || s.intel.graded.includes(e.square) || s.team.fight?.square === e.square;
export const shownEvents = <E extends Pick<MapEvent, 'kind' | 'square'>>(s: Sight & { events: E[] }) => s.events.filter((e) => eventShown(s, e));
