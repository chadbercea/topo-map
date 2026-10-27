import type { GameState } from './state';
import { kindOf } from './comms';

// The intel stream (ILI-1186): HQ is the intel cell for a whole fictional war, and its
// analysts' feed never stops. Most of it belongs to other operations. Items the analysts
// tie to an operation carry its code name, so filtering for a team's code name narrows the
// stream to that team's war. Once ALPHA is linked, the mission's own reports (HQ, ORION-3,
// map events) join the stream under its code name.

export type Intel = {
  id: string;
  atMs: number; // theater time
  source: string; // SIGINT, IMINT, HUMINT, OSINT, HQ, ORION-3, ...
  tags: string[]; // code names the analysts marked it with
  text: string;
  square?: string; // a square in ALPHA's AO, when it names one
};

export type Stream = { items: Intel[]; nextAtMs: number; n: number; filter: string };

type Line = Omit<Intel, 'id' | 'atMs'>;

// The rest of the war. Grid references off ALPHA's map sheet are other teams' ground.
const FEED: Line[] = [
  { source: 'SIGINT', tags: ['COPPER VEIL'], text: 'Burst transmissions on the northern net, 3 callers, Ridge 41 area.' },
  { source: 'IMINT', tags: ['NIGHT HERON'], text: 'Two technicals parked at the river crossing, MC 4177. No movement since 0400.' },
  { source: 'HUMINT', tags: ['GLASS ANVIL'], text: 'Source reports fuel convoy delayed at the quarry checkpoint. Reliability C.' },
  { source: 'OSINT', tags: [], text: 'Local channel claims power is out across the valley towns.' },
  { source: 'SIGINT', tags: ['BLACK BOX'], text: 'Enemy net chatter mentions "the bird" near the town. Location unresolved.' },
  { source: 'IMINT', tags: ['RED LANTERN'], text: 'Fresh vehicle tracks on the dry riverbed, heading east toward MD 0291.' },
  { source: 'HQ', tags: ['COPPER VEIL'], text: 'COPPER VEIL extracted clean. Debrief at 0900.' },
  { source: 'HUMINT', tags: [], text: 'Market prices for diesel doubled overnight. Supply line hit somewhere south.' },
  { source: 'SIGINT', tags: ['NIGHT HERON'], text: 'Jamming detected on 41.250. Possibly local, possibly a test.' },
  { source: 'IMINT', tags: ['BLACK BOX'], text: 'Last telemetry from the downed recon drone puts it in hill country, east of the town.' },
  { source: 'OSINT', tags: ['GLASS ANVIL'], text: 'Video posted of a mortar team firing from an orchard. Geolocation in progress.' },
  { source: 'HQ', tags: [], text: 'Weather cell: high cloud through the morning, clearing by noon.' },
  { source: 'SIGINT', tags: ['RED LANTERN'], text: 'Two handsets that went dark at the bridge came back up 4 km west.' },
  { source: 'HUMINT', tags: ['BLACK BOX'], text: 'Herder reports armed men walking the ridge above the crash site. Numbers unknown.' },
  { source: 'IMINT', tags: ['COPPER VEIL'], text: 'Battle damage at the relay mast: two of three dishes down.' },
  { source: 'OSINT', tags: [], text: 'Militia account boasting about a "drone hunt". Old photos, new caption.' },
  { source: 'SIGINT', tags: ['GLASS ANVIL'], text: 'Callsign "Saber" checking in every 20 minutes on the quarry net.' },
  { source: 'HQ', tags: ['BLACK BOX'], text: 'Client wants the flight recorder intact. Contract window opens when the team is linked.' },
  { source: 'IMINT', tags: ['NIGHT HERON'], text: 'A crowd at the north gate of the airfield. Looks civilian.' },
  { source: 'HUMINT', tags: ['RED LANTERN'], text: 'Driver says the checkpoint on Route 6 now wants papers and cash.' },
  { source: 'SIGINT', tags: [], text: 'Unidentified carrier on 38.900, no voice. Logging it.' },
  { source: 'OSINT', tags: ['COPPER VEIL'], text: 'Satellite provider imagery of the ridge is 9 days old. Not usable.' },
  { source: 'IMINT', tags: ['GLASS ANVIL'], text: 'Mortar tube silhouette under a tarp, orchard edge. Confidence moderate.' },
  { source: 'HQ', tags: ['NIGHT HERON'], text: 'NIGHT HERON reports one wounded, walking. Medevac not requested.' },
];

const BACKLOG = 7; // items already on the stream when the player sits down
const gap = (n: number) => 3_500 + ((n * 7919) % 3_000); // 3.5 to 6.5 s, varied but repeatable
const MAX = 80;

const make = (n: number, atMs: number): Intel => ({ ...FEED[n % FEED.length], id: `intel-${n}`, atMs });

export function initialStream(): Stream {
  const items: Intel[] = [];
  let at = 0;
  for (let n = BACKLOG - 1; n >= 0; n--) items.unshift(make(n, (at -= gap(n))));
  return { items, nextAtMs: gap(BACKLOG), n: BACKLOG, filter: '' };
}

// New intel arrives on theater time, whether or not a team is linked.
export function streamSystem(s: GameState): GameState {
  let { stream } = s;
  while (s.theaterMs >= stream.nextAtMs) {
    const item = make(stream.n, stream.nextAtMs);
    stream = { ...stream, items: [...stream.items, item].slice(-MAX), n: stream.n + 1, nextAtMs: stream.nextAtMs + gap(stream.n + 1) };
  }
  return stream === s.stream ? s : { ...s, stream };
}

const KIND = { contact: 'CONTACT', signal: 'SIGINT', site: 'KILL SITE', request: 'REQUEST' } as const;

// The linked mission's own reports, under its code name: what HQ and ORION-3 put out
// (calls and the team's own texts go to satcom instead), and every map event.
export function missionIntel(s: GameState): Intel[] {
  if (s.link.state !== 'linked') return [];
  const at = (ms: number) => s.link.atMs + ms;
  const tags = [s.link.codename];
  const reports = s.comms.messages
    .filter((m) => m.from !== s.team.callsign && kindOf(m) !== 'call')
    .map((m) => ({ id: `msg-${m.id}`, atMs: at(m.atMs), source: m.from, tags, text: m.text, square: m.square }));
  const events = s.events.map((e) => ({ id: `ev-${e.id}`, atMs: at(e.atMs), source: KIND[e.kind], tags, text: `${e.square} · ${e.title}`, square: e.square }));
  return [...reports, ...events];
}

const norm = (t: string) => t.trim().toUpperCase().replace(/\s+/g, ' ');
export const matches = (i: Intel, filter: string) => {
  const f = norm(filter);
  return !f || i.tags.some((t) => t.includes(f)) || norm(i.source).includes(f) || norm(i.text).includes(f) || i.square === f;
};

// Everything on the stream, newest first, through the filter.
export function streamView(s: GameState): Intel[] {
  return [...s.stream.items, ...missionIntel(s)].filter((i) => matches(i, s.stream.filter)).sort((a, b) => b.atMs - a.atMs);
}
