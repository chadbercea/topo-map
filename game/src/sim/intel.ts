import type { GameState } from './state';

// ALPHA's intel gauge (ILI-1314): what keeps the team moving. The team is autonomous and has
// its mission; HQ keeps it fed. Every scan goes to the analysts, who push what it was worth to
// the operators: a photo's intel hits the gauge and decays to nothing over ten seconds, so HQ
// has to keep scanning; a decoded intercept does the same; video, once, is a permanent floor.
// ALPHA moves while the gauge is at the threshold or above, and holds below it.
// Starting values are Claude's picks for Chad to tune by feel.

export const GAUGE_MAX = 100;
export const MOVE_AT = 20; // the team moves at or above this
export const DECAY_MS = 10_000; // a feed fades to nothing over this
export const VIDEO_FLOOR = 40; // video's permanent buff, once a session
export const SIGNAL_INTEL = 35; // a decoded intercept

// What the analysts make of a photo, by what it found there.
export type Grade = 'clear' | 'low' | 'medium' | 'high';
export const GRADE_INTEL: Record<Grade, number> = { clear: 10, low: 15, medium: 30, high: 50 };
export const GRADE_LABEL: Record<Grade, string> = { clear: 'all clear', low: 'low-grade intel', medium: 'medium-grade intel', high: 'high-grade intel' };

export type Feed = { atMs: number; amount: number };
// base: a fixed offset that survives a restart (tests and tuning run with the gauge full);
// floor: video's buff; graded: squares the analysts have already been through.
export type Intel = { base: number; floor: number; feeds: Feed[]; videoUsed: boolean; graded: string[] };

export const initialIntel = (): Intel => ({ base: 0, floor: 0, feeds: [], videoUsed: false, graded: [] });

// The gauge now, 0 to 100: the base and floor, plus every feed still fading.
export function gauge(s: GameState): number {
  const { base, floor, feeds } = s.intel;
  const live = feeds.reduce((n, f) => n + f.amount * Math.max(0, 1 - (s.elapsedMs - f.atMs) / DECAY_MS), 0);
  return Math.min(GAUGE_MAX, base + floor + live);
}

export const moving = (s: GameState) => gauge(s) >= MOVE_AT;

// Feed the gauge (a photo's grade, a decoded intercept). Spent feeds drop off as new ones come.
export function feed(s: GameState, amount: number): GameState {
  const feeds = [...s.intel.feeds.filter((f) => s.elapsedMs - f.atMs < DECAY_MS), { atMs: s.elapsedMs, amount }];
  return { ...s, intel: { ...s.intel, feeds } };
}

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

// A photo graded and pushed: the gauge takes it, and the square is marked as gone through.
export function pushPhoto(s: GameState, square: string, fighters: number): { next: GameState; grade: Grade } {
  const g = grade(s, square, fighters);
  const next = feed(s, GRADE_INTEL[g]);
  return { next: { ...next, intel: { ...next.intel, graded: [...new Set([...next.intel.graded, square])] } }, grade: g };
}

// Video: the permanent floor, once a session.
export const pushVideo = (s: GameState): GameState => ({ ...s, intel: { ...s.intel, floor: Math.max(s.intel.floor, VIDEO_FLOOR), videoUsed: true } });
