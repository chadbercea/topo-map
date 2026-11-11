import type { GameState } from './state';
import { photoFactor } from './upgrades';
import { CELL } from '../map/grid';

// ALPHA's intel gauge (ILI-1314): what keeps the team moving. The team is autonomous and has
// its mission; HQ keeps it fed. Every scan goes to the analysts, who push what it was worth to
// the operators.
// Intel is fuel (ILI-1341): what HQ pushes fills the gauge, and ALPHA burns it by walking, a
// square's worth of ground for every SQUARE_INTEL. It doesn't fade while ALPHA stands still, so
// every scan moves the team; it runs dry only as ALPHA covers ground, so HQ has to keep
// scanning ahead of it. Empty, ALPHA holds.
// Scanning ahead pays (ILI-1316): a photo of a square further along ALPHA's route than the one
// it's heading into is banked, and hits the gauge when ALPHA starts the leg into that square;
// so HQ a few squares ahead keeps the team rolling. The square it's heading into, or one off
// the route, feeds the gauge at once.
// Starting values are Claude's picks for Chad to tune by feel.

export const GAUGE_MAX = 100; // a full gauge: four squares of walking
export const SQUARE_INTEL = 25; // intel ALPHA burns crossing one square
export const LOW_AT = SQUARE_INTEL; // under a square left: HQ is told to scan ahead
export const VIDEO_INTEL = 60; // video: one big fill, once a session
export const SIGNAL_INTEL = 35; // a decoded intercept

// What the analysts make of a photo, by what it found there.
export type Grade = 'clear' | 'low' | 'medium' | 'high';
export const GRADE_INTEL: Record<Grade, number> = { clear: 12, low: 25, medium: 50, high: 75 }; // half a square to three
export const GRADE_LABEL: Record<Grade, string> = { clear: 'all clear', low: 'low-grade intel', medium: 'medium-grade intel', high: 'high-grade intel' };

// base: a fixed offset that survives a restart and never burns (tests and tuning run with the
// gauge full); fuel: what HQ has pushed and ALPHA hasn't walked off yet; graded: squares the
// analysts have already been through.
export type Intel = { base: number; fuel: number; videoUsed: boolean; videosShot: number; graded: string[]; banked: { square: string; amount: number }[]; pushes: Push[]; live: string[] }; // live: squares on video, live for good (ILI-1432)

// Every push of intel to ALPHA, in order (ILI-1346). A banked push turns fed when it pays out.
// source: who produced it (IMINT for ORION-3's looks, SIGINT for a decode, ALPHA for what the
// team found itself). items: what the push says, as intel reports (ILI-1362).
export type PushSource = 'IMINT' | 'SIGINT' | 'ALPHA';
// held: a scan's intel, with the analysts until Photo sends it to ALPHA (ILI-1432).
export type Push = { id: string; atMs: number; source: PushSource; square?: string; grade?: Grade | 'video'; amount: number; state: 'fed' | 'banked' | 'held'; fedMs?: number; items?: IntelItem[] };
export type PushFrom = { source: PushSource; square?: string; grade?: Grade | 'video'; items?: IntelItem[] };

// The five types of intel (ILI-1362): the five real intelligence disciplines. Every ORION-3
// scan brings in at least one report, and which types turn up is random (seeded, so a mission
// replays exactly). A quiet square still brings in a "nothing here" report: real, low-level
// intel, and it still fills the gauge. A hot one can bring in three at once.
export const INT_KINDS = ['GEOINT', 'SIGINT', 'HUMINT', 'MASINT', 'OSINT'] as const;
export type IntKind = (typeof INT_KINDS)[number];
export type Heat = 'quiet' | 'some' | 'hot';
export type IntelItem = { kind: IntKind; heat: Heat; text: string };

const REPORT: Record<IntKind, Record<Heat, string>> = {
  GEOINT: { quiet: 'nothing moving in the picture', some: 'fresh tracks, a vehicle came through', hot: 'armed men in the open' },
  SIGINT: { quiet: 'no traffic on their nets', some: 'a burst of radio traffic, then quiet', hot: 'radio traffic, they’re calling for help' },
  HUMINT: { quiet: 'locals say nothing unusual', some: 'a shepherd saw a truck pass', hot: 'a local says fighters came through at dawn' },
  MASINT: { quiet: 'no heat signatures', some: 'one heat signature, could be an animal', hot: 'heat signatures, several, close together' },
  OSINT: { quiet: 'nothing posted from here', some: 'a photo from here, two days old', hot: 'a post shows armed men here today' },
};

const HEAT: Record<Grade | 'video', Heat> = { clear: 'quiet', low: 'some', medium: 'some', high: 'hot', video: 'some' };
const COUNT: Record<Grade | 'video', number> = { clear: 1, low: 1, medium: 2, high: 3, video: 2 };

// The reports a look brings in: one to three, of different random types.
export function reports(s: GameState, square: string, grade: Grade | 'video', fighters = 0): IntelItem[] {
  let h = (s.seed ^ Math.imul(s.intel.pushes.length + 1, 0x9e3779b1)) >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const kinds: IntKind[] = [...INT_KINDS];
  const out: IntelItem[] = [];
  for (let i = 0; i < COUNT[grade]; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const kind = kinds.splice(h % kinds.length, 1)[0];
    const heat = HEAT[grade];
    const text = kind === 'GEOINT' && fighters ? `${fighters} armed in the picture` : REPORT[kind][heat];
    out.push({ kind, heat, text });
  }
  return out;
}

export const initialIntel = (): Intel => ({ base: 0, fuel: 0, videoUsed: false, videosShot: 0, graded: [], banked: [], pushes: [], live: [] });

const record = (s: GameState, from: PushFrom, amount: number, state: Push['state']): GameState => ({
  ...s,
  intel: { ...s.intel, pushes: [...s.intel.pushes, { id: `push-${s.intel.pushes.length}`, atMs: s.elapsedMs, ...from, amount, state, ...(state === 'fed' ? { fedMs: s.elapsedMs } : {}) }] },
});

// The gauge now, 0 to 100.
export const gauge = (s: GameState): number => Math.min(GAUGE_MAX, s.intel.base + s.intel.fuel);

export const moving = (s: GameState) => gauge(s) > 0;

// Feed the gauge (a photo's grade, a decoded intercept), up to full. With from, it's a push
// COMMS shows as a card.
export const feed = (s: GameState, amount: number, from?: PushFrom): GameState => {
  const fed = { ...s, intel: { ...s.intel, fuel: Math.min(GAUGE_MAX, s.intel.fuel + amount) } };
  return from ? record(fed, from, amount, 'fed') : fed;
};

// ALPHA walked this many world units: the intel it burned.
export const burn = (s: GameState, units: number): GameState => ({ ...s, intel: { ...s.intel, fuel: Math.max(0, s.intel.fuel - (units / CELL) * SQUARE_INTEL) } });

// The square's worth (RNG, by square): mostly nothing or a lot at low quality, now and then
// more. Seeded by the mission's seed so a mission replays exactly. Fighters in the picture are
// always high grade; a square the analysts have been through already is only all clear.
export function grade(s: GameState, square: string, fighters: number): Grade {
  if (s.intel.graded.includes(square)) return 'clear';
  if (fighters) return 'high';
  let h = s.seed >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const r = (h % 1000) / 1000;
  return r < 0.45 ? 'clear' : r < 0.8 ? 'low' : r < 0.95 ? 'medium' : 'high';
}

// One scan settles a square (ILI-1399): once HQ's analysts have been through it, it's known
// ground. ALPHA crosses it without burning intel, and there's never a reason to scan it again.
export const settled = (s: GameState, square: string) => s.intel.graded.includes(square);

// What HQ's scans of a square turned up (ILI-1399): every report that landed for it, and whether
// it all came to nothing (clear) or found something.
export const squareReports = (s: GameState, square: string): IntelItem[] => s.intel.pushes.filter((p) => p.square === square).flatMap((p) => p.items ?? []);
export const squareFindings = (s: GameState, square: string): 'clear' | 'found' =>
  squareReports(s, square).some((r) => r.heat !== 'quiet') || s.contacts.some((c) => c.square === square && c.status === 'revealed') ? 'found' : 'clear';

// Further along the route than the leg ALPHA is on: banked for later.
export const ahead = (s: GameState, square: string) => s.team.route.slice(s.team.waypoint + 1).includes(square);

// A photo graded and pushed: the gauge takes it now, or the bank holds it for when ALPHA heads
// into the square; either way the square is marked as gone through.
export function pushPhoto(s: GameState, square: string, fighters: number): { next: GameState; grade: Grade; banked: boolean } {
  const g = grade(s, square, fighters);
  const banked = ahead(s, square);
  const amount = GRADE_INTEL[g] * photoFactor(s); // more analysts, more out of it (ILI-1317)
  const from: PushFrom = { source: 'IMINT', square, grade: g, items: reports(s, square, g, fighters) };
  const next = banked ? record({ ...s, intel: { ...s.intel, banked: [...s.intel.banked, { square, amount }] } }, from, amount, 'banked') : feed(s, amount, from);
  return { next: { ...next, intel: { ...next.intel, graded: [...new Set([...next.intel.graded, square])] } }, grade: g, banked };
}

// Scan (ILI-1432): the analysts go through the square and its reports land on it; the square is
// settled. The intel waits with them until HQ sends it to ALPHA with Photo.
export function holdScan(s: GameState, square: string, fighters: number): { next: GameState; grade: Grade } {
  const g = grade(s, square, fighters);
  const amount = GRADE_INTEL[g] * photoFactor(s);
  const next = record(s, { source: 'IMINT', square, grade: g, items: reports(s, square, g, fighters) }, amount, 'held');
  return { next: { ...next, intel: { ...next.intel, graded: [...new Set([...next.intel.graded, square])] } }, grade: g };
}

// Photo (ILI-1432): a scanned square's intel goes to ALPHA, now or banked for when it heads in.
export const heldIntel = (s: GameState, square: string) => s.intel.pushes.find((p) => p.square === square && p.state === 'held');
export function sendPhoto(s: GameState, square: string): GameState {
  const p = heldIntel(s, square);
  if (!p) return s;
  const banked = ahead(s, square);
  const pushes = s.intel.pushes.map((x) => (x === p ? { ...x, state: banked ? ('banked' as const) : ('fed' as const), ...(banked ? {} : { fedMs: s.elapsedMs }) } : x));
  const intel = banked ? { ...s.intel, pushes, banked: [...s.intel.banked, { square, amount: p.amount }] } : { ...s.intel, pushes, fuel: Math.min(GAUGE_MAX, s.intel.fuel + p.amount) };
  return { ...s, intel };
}

// The bank pays out as ALPHA starts the leg into a square HQ scanned ahead (ILI-1316), or
// at once if ALPHA's route no longer goes there (it went around it, ILI-1315): the intel did
// its work either way.
export const intelSystem = (s: GameState): GameState => {
  const next = s.team.route[s.team.waypoint];
  const ahead = s.team.route.slice(s.team.waypoint);
  const isDue = (b: { square: string }) => b.square === next || !ahead.includes(b.square);
  const due = s.intel.banked.filter(isDue);
  if (!due.length) return s;
  const paid = due.reduce((n, b) => feed(n, b.amount), s);
  // Its card turns from banked to fed.
  const squares = new Set(due.map((b) => b.square));
  const pushes = paid.intel.pushes.map((p) => (p.state === 'banked' && p.square && squares.has(p.square) ? { ...p, state: 'fed' as const, fedMs: s.elapsedMs } : p));
  return { ...paid, intel: { ...paid.intel, banked: paid.intel.banked.filter((b) => !isDue(b)), pushes } };
};

// Video: one big fill, once a session (twice with a second feed, ILI-1317).
// Video (ILI-1432): no limit any more, and its square goes live on the map for good.
export const pushVideo = (s: GameState): GameState => {
  const square = s.satellite.aim;
  const fed = feed(s, VIDEO_INTEL, { source: 'IMINT', square, grade: 'video', items: reports(s, square ?? '', 'video') });
  return { ...fed, intel: { ...fed.intel, videosShot: s.intel.videosShot + 1, live: [...new Set([...(fed.intel.live ?? []), square])] } };
};
