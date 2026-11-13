import type { GameState } from './state';
import { photoFactor } from './upgrades';
import { CELL, squareAt } from '../map/grid';
import { knownIn, knownSquare } from './contacts';
import { learn, tell } from './picture';
import { teamStatus } from './team';

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
export type Intel = { base: number; fuel: number; videoUsed: boolean; videosShot: number; graded: string[]; banked: { square: string; amount: number }[]; pushes: Push[]; live: string[]; download?: Download | null; syncedAt?: string | null; reopened?: string[] }; // live: squares on video, live for good (ILI-1432); reopened: settled squares HQ has acted on since, open to Analyze again (ILI-1516); download: ALPHA pulling packages off the shelf; syncedAt: the square it last synced in (ILI-1499)
export type Download = { startMs: number; untilMs: number; ids: string[] };

// Every push of intel to ALPHA, in order (ILI-1346). A banked push turns fed when it pays out.
// source: who produced it (IMINT for ORION-3's looks, SIGINT for a decode, ALPHA for what the
// team found itself). items: what the push says, as intel reports (ILI-1362).
export type PushSource = 'IMINT' | 'SIGINT' | 'ALPHA';
// posted: on the shelf for its square, waiting for ALPHA to pull it; pulling: coming down to the
// team's SATCOM devices (ILI-1499). pulledMs: when ALPHA had it.
export type Push = { id: string; atMs: number; source: PushSource; square?: string; grade?: Grade | 'video'; amount: number; state: 'fed' | 'banked' | 'posted' | 'pulling'; fedMs?: number; pulledMs?: number; items?: IntelItem[]; contactId?: string };
export type PushFrom = { source: PushSource; square?: string; grade?: Grade | 'video'; items?: IntelItem[]; contactId?: string };

// The five types of intel (ILI-1362): the five real intelligence disciplines. Every ORION-3
// scan brings in at least one report, and which types turn up is random (seeded, so a mission
// replays exactly). A quiet square still brings in a "nothing here" report: real, low-level
// intel, and it still fills the gauge. A hot one can bring in three at once.
export const INT_KINDS = ['GEOINT', 'SIGINT', 'HUMINT', 'MASINT', 'OSINT'] as const;
export type IntKind = (typeof INT_KINDS)[number];
export type Heat = 'quiet' | 'some' | 'hot';
export type IntelItem = { kind: IntKind; heat: Heat; text: string };

// What the player reads for each kind (ILI-1510): what the intel is, not its discipline's code.
// The codes stay in the sim; anything on screen says imagery, audio, and so on.
export const KIND_LABEL: Record<IntKind | PushSource, string> = { GEOINT: 'Imagery', IMINT: 'Imagery', SIGINT: 'Audio', HUMINT: 'Local', MASINT: 'Thermal', OSINT: 'Online', ALPHA: 'ALPHA' };
export const kindLabel = (code: string) => (KIND_LABEL as Record<string, string>)[code] ?? code;

const REPORT: Record<IntKind, Record<Heat, string>> = {
  GEOINT: { quiet: 'nothing moving in the picture', some: 'fresh tracks, a vehicle came through', hot: 'armed men in the open' },
  SIGINT: { quiet: 'no traffic on their nets', some: 'radio traffic on their net', hot: 'radio traffic, they’re calling for help' },
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

export const initialIntel = (): Intel => ({ base: 0, fuel: 0, videoUsed: false, videosShot: 0, graded: [], banked: [], pushes: [], live: [], download: null, syncedAt: null, reopened: [] });

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
  if (fighters) return 'high';
  if (s.intel.graded.includes(square)) return 'clear';
  let h = s.seed >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const r = (h % 1000) / 1000;
  return r < 0.45 ? 'clear' : r < 0.8 ? 'low' : r < 0.95 ? 'medium' : 'high';
}

// One scan settles a square (ILI-1399): once HQ's analysts have been through it, it's known
// ground. ALPHA crosses it without burning intel, and there's never a reason to scan it again.
export const settled = (s: GameState, square: string) => s.intel.graded.includes(square);

// ...until HQ acts on it (ILI-1516): a strike, a jam or a search changes the ground, so a settled
// square HQ has acted on since its last Analyze is open to another (a re-image after the action:
// what's left, or that it's clear). The square stays settled; only the Analyze comes back.
export const reopened = (s: GameState, square: string) => (s.intel.reopened ?? []).includes(square);
export const reopen = (s: GameState, square: string): GameState =>
  settled(s, square) && !reopened(s, square) ? { ...s, intel: { ...s.intel, reopened: [...(s.intel.reopened ?? []), square] } } : s;
// Analyze is open on a square: never analyzed, or acted on since.
export const analyzable = (s: GameState, square: string) => !settled(s, square) || reopened(s, square);

// What HQ's scans of a square turned up (ILI-1399): every report that landed for it, and whether
// it all came to nothing (clear) or found something.
export const squareReports = (s: GameState, square: string): IntelItem[] => s.intel.pushes.filter((p) => p.square === square).flatMap((p) => p.items ?? []);
export const squareFindings = (s: GameState, square: string): 'clear' | 'found' =>
  squareReports(s, square).some((r) => r.heat !== 'quiet') || knownIn(s, square).length > 0 ? 'found' : 'clear';

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

// Analyze (ILI-1432, ILI-1499): the analysts go through the square, its reports land on it, and the
// square is settled. Their package goes on the shelf for that square: HQ never pushes to ALPHA.
export function postScan(s: GameState, square: string, fighters: number): { next: GameState; grade: Grade } {
  const g = grade(s, square, fighters);
  const amount = GRADE_INTEL[g] * photoFactor(s);
  const next = record(s, { source: 'IMINT', square, grade: g, items: reports(s, square, g, fighters) }, amount, 'posted');
  const reopenedLeft = (next.intel.reopened ?? []).filter((x) => x !== square); // analyzed again: settled again
  return { next: { ...next, intel: { ...next.intel, graded: [...new Set([...next.intel.graded, square])], reopened: reopenedLeft } }, grade: g };
}

// ORION-3 watching an analyzed square sees a group walk in (ILI-1493): the analysts post a fresh
// package on it, like an Analyze's (ILI-1495, ILI-1499). ALPHA doesn't know until it pulls it.
export function postSighting(s: GameState, square: string, fighters: number): GameState {
  if (postedIntel(s, square)) return s;
  return record(s, { source: 'IMINT', square, grade: 'high', items: reports(s, square, 'high', fighters) }, GRADE_INTEL.high * photoFactor(s), 'posted');
}

// The shelf (ILI-1499). HQ is the upload: it can't force data onto the team's SATCOM devices, so
// the best it can do is post each package for its square and leave it there. ALPHA pulls them.
// The rule (doctrine: the team syncs its devices on a halt, and as it reaches each square of its
// route): ALPHA syncs whenever it's holding, and each time it reaches a new square. A sync takes
// every package on the shelf down in one download of DOWNLOAD_MS of game time, on the move or
// not. Only a finished download fills the gauge and tells ALPHA what's in the square
// (team.known, ILI-1495); a package for a square further along its route is banked for the leg
// into it, as before (ILI-1316).
export const DOWNLOAD_MS = 3_000;
const imintOn = (s: GameState, square: string) => s.intel.pushes.filter((p) => p.square === square && p.source === 'IMINT');
export const postedIntel = (s: GameState, square: string) => s.intel.pushes.find((p) => p.square === square && p.state === 'posted');
export const shelf = (s: GameState) => s.intel.pushes.filter((p) => p.state === 'posted');
// A package for the square still on the shelf, or coming down: ALPHA doesn't have it yet.
export const waiting = (s: GameState, square: string) => s.intel.pushes.some((p) => p.square === square && (p.state === 'posted' || p.state === 'pulling'));
// Where a square's package is, for its mark on the map and its line in the square's panel.
export type ShelfState = 'posted' | 'pulling' | 'received';
export function shelfState(s: GameState, square: string): ShelfState | null {
  const ps = imintOn(s, square);
  if (!ps.length) return null;
  if (ps.some((p) => p.state === 'posted')) return 'posted';
  if (ps.some((p) => p.state === 'pulling')) return 'pulling';
  return 'received';
}
// How far the download is, 0 to 1.
export const downloadProgress = (s: GameState) => {
  const d = s.intel.download;
  return d ? Math.min(1, Math.max(0, (s.elapsedMs - d.startMs) / (d.untilMs - d.startMs))) : 0;
};

// One package down on ALPHA's devices: the gauge takes it now (or banks it for the leg into a
// square further on), and ALPHA knows what the analysts saw there (ILI-1495). A video package is
// the feed itself: it lands at once, and from then ALPHA's picture of that square stays live.
function deliver(s: GameState, p: Push): GameState {
  const banked = p.grade !== 'video' && !!p.square && ahead(s, p.square);
  const pushes = s.intel.pushes.map((x) => (x.id === p.id ? { ...x, state: banked ? ('banked' as const) : ('fed' as const), pulledMs: s.elapsedMs, ...(banked ? {} : { fedMs: s.elapsedMs }) } : x));
  const intel = banked ? { ...s.intel, pushes, banked: [...s.intel.banked, { square: p.square!, amount: p.amount }] } : { ...s.intel, pushes, fuel: Math.min(GAUGE_MAX, s.intel.fuel + p.amount) };
  let next: GameState = { ...s, intel };
  // A decoded intercept (ILI-1499): ALPHA learns their plan, and with a fix, where they are (ILI-1495).
  if (p.source === 'SIGINT' && p.contactId) {
    next = { ...next, contacts: next.contacts.map((x) => (x.id === p.contactId ? { ...x, planKnown: true } : x)) };
    const c = next.contacts.find((x) => x.id === p.contactId);
    if (c && p.square && knownSquare(next, c) === p.square) next = learn(next, c, p.square);
    return next;
  }
  return p.square ? tell(next, p.square) : next;
}

// Decoded traffic goes on the shelf like any package (ILI-1499): HQ can't push it to ALPHA.
export const postDecoded = (s: GameState, square: string, contactId: string | undefined, amount: number): GameState =>
  record(s, { source: 'SIGINT', square, contactId, items: [{ kind: 'SIGINT', heat: 'hot', text: 'decoded: what they plan' }] }, amount, 'posted');

export const pullSystem = (s: GameState): GameState => {
  let next = s;
  const d = s.intel.download;
  if (d && s.elapsedMs >= d.untilMs) {
    for (const id of d.ids) {
      const p = next.intel.pushes.find((x) => x.id === id);
      if (p?.state === 'pulling') next = deliver(next, p);
    }
    next = { ...next, intel: { ...next.intel, download: null } };
  }
  const here = squareAt(next.team.position.x, next.team.position.y);
  const reached = !!here && here !== next.intel.syncedAt;
  if (reached) next = { ...next, intel: { ...next.intel, syncedAt: here } };
  if (next.intel.download) return next;
  const posted = shelf(next);
  if (!posted.length || !(reached || teamStatus(next) === 'Holding')) return next;
  const ids = posted.map((p) => p.id);
  const pushes = next.intel.pushes.map((p) => (ids.includes(p.id) ? { ...p, state: 'pulling' as const } : p));
  return { ...next, intel: { ...next.intel, pushes, download: { startMs: next.elapsedMs, untilMs: next.elapsedMs + DOWNLOAD_MS, ids } } };
};

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

// Video (ILI-1432): no limit, and its square goes live on the map for good. Its feed goes on the
// shelf like an Analyze's package (ILI-1499): ALPHA gets the big fill, and the live feed of the
// square, when it pulls it.
export const pushVideo = (s: GameState): GameState => {
  const square = s.satellite.aim;
  const posted = record(s, { source: 'IMINT', square, grade: 'video', items: reports(s, square ?? '', 'video') }, VIDEO_INTEL, 'posted');
  return { ...posted, intel: { ...posted.intel, videosShot: s.intel.videosShot + 1, live: [...new Set([...(posted.intel.live ?? []), square])] } };
};
