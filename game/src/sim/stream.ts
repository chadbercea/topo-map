import type { GameState } from './state';
import { kindOf } from './comms';

// The intel stream (ILI-1186, cut to the MVP in ILI-1194): this mission's intel, down the
// left. It opens on what the analysts had on the crash before HQ sat down, then HQ's and
// ORION-3's reports and every map event, as they come. The theater-wide feed of other
// operations is a later idea, not the MVP.

export type Intel = {
  id: string;
  atMs: number; // mission time; the analysts' notes from before the mission are negative
  source: string; // SIGINT, IMINT, HUMINT, HQ, ORION-3, CONTACT, ...
  text: string;
  square?: string; // a square in ALPHA's AO, when it names one
};

export type Stream = { items: Intel[] };

// What the analysts had before HQ sat down (game time runs 40x: a real second back is
// two-thirds of a game minute).
export const initialStream = (): Stream => ({
  items: [
    { id: 'intel-drone', atMs: -45_000, source: 'IMINT', text: 'Last telemetry from the downed recon drone puts it in hill country, east of the town.' },
    { id: 'intel-chatter', atMs: -30_000, source: 'SIGINT', text: 'Enemy net chatter mentions "the bird" near the town. Location unresolved.' },
    { id: 'intel-herder', atMs: -15_000, source: 'HUMINT', text: 'Herder reports armed men walking the ridge above the crash site. Numbers unknown.' },
  ],
});

const KIND = { contact: 'CONTACT', signal: 'SIGINT', site: 'KILL SITE', request: 'REQUEST' } as const;

// The mission's own reports: what HQ and ORION-3 put out (calls and the team's own texts go
// to satcom instead), and every map event.
export function missionIntel(s: GameState): Intel[] {
  const reports = s.comms.messages
    .filter((m) => m.from !== s.team.callsign && kindOf(m) !== 'call')
    .map((m) => ({ id: `msg-${m.id}`, atMs: m.atMs, source: m.from, text: m.text, square: m.square }));
  const events = s.events.map((e) => ({ id: `ev-${e.id}`, atMs: e.atMs, source: KIND[e.kind], text: `${e.square} · ${e.title}`, square: e.square }));
  return [...reports, ...events];
}

// Everything on the stream, newest first.
export const streamView = (s: GameState): Intel[] => [...s.stream.items, ...missionIntel(s)].sort((a, b) => b.atMs - a.atMs);
