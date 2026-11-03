import type { GameState } from './state';
import { photoFactor, videos } from './upgrades';
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
export type Intel = { base: number; fuel: number; videoUsed: boolean; videosShot: number; graded: string[]; banked: { square: string; amount: number }[]; pushes: Push[] };

// Every push of intel to ALPHA, in order (ILI-1346): what COMMS shows as routine intel cards.
// A banked push turns fed when it pays out. source: who produced it (IMINT for ORION-3's looks,
// SIGINT for a decode, ALPHA for what the team found itself).
export type PushSource = 'IMINT' | 'SIGINT' | 'ALPHA';
export type Push = { id: string; atMs: number; source: PushSource; square?: string; grade?: Grade | 'video'; amount: number; state: 'fed' | 'banked'; fedMs?: number };
export type PushFrom = { source: PushSource; square?: string; grade?: Grade | 'video' };

export const initialIntel = (): Intel => ({ base: 0, fuel: 0, videoUsed: false, videosShot: 0, graded: [], banked: [], pushes: [] });

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
  let h = s.rng >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const r = (h % 1000) / 1000;
  return r < 0.45 ? 'clear' : r < 0.8 ? 'low' : r < 0.95 ? 'medium' : 'high';
}

// Further along the route than the leg ALPHA is on: banked for later.
export const ahead = (s: GameState, square: string) => s.team.route.slice(s.team.waypoint + 1).includes(square);

// A photo graded and pushed: the gauge takes it now, or the bank holds it for when ALPHA heads
// into the square; either way the square is marked as gone through.
export function pushPhoto(s: GameState, square: string, fighters: number): { next: GameState; grade: Grade; banked: boolean } {
  const g = grade(s, square, fighters);
  const banked = ahead(s, square);
  const amount = GRADE_INTEL[g] * photoFactor(s); // more analysts, more out of it (ILI-1317)
  const from: PushFrom = { source: 'IMINT', square, grade: g };
  const next = banked ? record({ ...s, intel: { ...s.intel, banked: [...s.intel.banked, { square, amount }] } }, from, amount, 'banked') : feed(s, amount, from);
  return { next: { ...next, intel: { ...next.intel, graded: [...new Set([...next.intel.graded, square])] } }, grade: g, banked };
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
export const pushVideo = (s: GameState): GameState => {
  const shot = s.intel.videosShot + 1;
  const fed = feed(s, VIDEO_INTEL, { source: 'IMINT', square: s.satellite.aim, grade: 'video' });
  return { ...fed, intel: { ...fed.intel, videosShot: shot, videoUsed: shot >= videos(s) } };
};
