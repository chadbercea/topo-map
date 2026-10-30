import type { GameState } from './state';
import { kindOf, type Message } from './comms';
import type { EventKind, EventStatus } from './events';

// The intel stream (ILI-1186, cut to the MVP in ILI-1194, ILI-1197): this mission's intel,
// down the left. It opens on what the analysts had on the crash before HQ sat down, then
// everything the mission turns up as it comes: ORION-3's looks, SIGINT, strike reports, HQ's
// news, and every map event, inline, where HQ opens it, plays its mini game, and reads what it
// produced. Items read differently by kind, and the routine ones sit quiet; until the first
// event the whole feed is quiet.

export type IntelKind = 'note' | 'imagery' | 'sigint' | 'strike' | 'hq' | 'alert' | 'event';

export type Intel = {
  id: string;
  atMs: number; // mission time; the analysts' notes from before the mission are negative
  kind: IntelKind;
  source: string; // HUMINT, IMINT, SIGINT, ORION-3, REAPER-1, HQ, CONTACT, ...
  text: string;
  quiet: boolean; // routine: shown dimmed
  square?: string; // a square in ALPHA's AO, when it names one
  event?: { id: string; kind: EventKind; status: EventStatus }; // an event HQ can open
};

export type Stream = { items: Intel[] };

// What the analysts had before HQ sat down (game time runs 24x: a real second back is
// two-fifths of a game minute).
export const initialStream = (): Stream => ({
  items: [
    { id: 'intel-drone', atMs: -75_000, kind: 'note', source: 'IMINT', quiet: true, text: 'Last telemetry from the downed recon drone puts it in hill country, east of the town.' },
    { id: 'intel-chatter', atMs: -50_000, kind: 'note', source: 'SIGINT', quiet: true, text: 'Enemy net chatter mentions "the bird" near the town. Location unresolved.' },
    { id: 'intel-herder', atMs: -25_000, kind: 'note', source: 'HUMINT', quiet: true, text: 'Herder reports armed men walking the ridge above the crash site. Numbers unknown.' },
  ],
});

const STRIKES = new Set(['REAPER-1', 'OVERWATCH', 'HAMMER-2']);
export const EVENT_LABEL: Record<EventKind, string> = { contact: 'CONTACT', signal: 'SIGNAL', site: 'KILL SITE', request: 'REQUEST' };

// What kind of intel a message is, and whether it's routine. ORION-3 moving is routine; on
// station and what it saw aren't.
export function classify(m: Message): { kind: IntelKind; quiet: boolean } {
  if (m.alert) return { kind: 'alert', quiet: false };
  // On station it's ready for HQ's shot (ILI-1257), so that line speaks up; moving stays quiet.
  if (m.from === 'ORION-3') return { kind: 'imagery', quiet: m.id.startsWith('slew-') };
  if (m.from === 'SIGINT') return { kind: 'sigint', quiet: false };
  if (STRIKES.has(m.from)) return { kind: 'strike', quiet: false };
  return { kind: 'hq', quiet: false };
}

// The mission's own intel: what HQ, ORION-3, SIGINT and the strike assets put out, the team's
// news (an ambush, say; its other texts and every call go to satcom), and every map event.
export function missionIntel(s: GameState): Intel[] {
  const reports = s.comms.messages
    .filter((m) => (m.from !== s.team.callsign || m.alert) && kindOf(m) !== 'call')
    .map((m) => ({ id: `msg-${m.id}`, atMs: m.atMs, source: m.from, text: m.text, square: m.square, ...classify(m) }));
  const events = s.events.map((e) => ({
    id: `ev-${e.id}`,
    atMs: e.atMs,
    kind: 'event' as const,
    source: EVENT_LABEL[e.kind],
    text: e.title,
    quiet: e.status === 'resolved',
    square: e.square,
    event: { id: e.id, kind: e.kind, status: e.status },
  }));
  return [...reports, ...events];
}

// Everything on the stream, newest first. Until the first event the feed is all quiet.
export function streamView(s: GameState): Intel[] {
  const started = s.events.length > 0;
  return [...s.stream.items, ...missionIntel(s)].map((i) => (started ? i : { ...i, quiet: true })).sort((a, b) => b.atMs - a.atMs);
}
