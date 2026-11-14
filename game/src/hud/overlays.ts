import { toScreen } from '../game/events';
import { CELL, parseSquare } from '../map/grid';

// What floats over the map (ILI-1215), so each piece can place itself clear of the rest:
// the status widget, the band (assets, a mini game), the square card and its action panel,
// ALPHA's flag, and ORION-3's panel down the right (ILI-1226). Each carries data-overlay with its name. Placement tries spots in order and
// takes the first clear of what's already there, ALPHA's formation and the square being
// worked; only when none is clear does it take the least-covered one.
export type Box = { x: number; y: number; w: number; h: number };

export const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// The floating panels on screen now, but for the named ones (usually the asker itself).
export function obstacles(except: string[] = []): Box[] {
  return [...document.querySelectorAll<HTMLElement>('[data-overlay]')]
    .filter((el) => !except.includes(el.dataset.overlay!) && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height)
    .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
}

// Only the named floating panels on screen now.
export const overlaysNamed = (names: string[]): Box[] =>
  names.flatMap((n) => [...document.querySelectorAll<HTMLElement>(`[data-overlay="${n}"]`)]).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));

// ALPHA's five dots on screen (ILI-1210), with a little room around them.
export function alphaBox(team: { x: number; y: number }): Box | null {
  const p = toScreen(team.x, team.y);
  return p && { x: p.x - 30, y: p.y - 30, w: 60, h: 60 };
}

// A grid square on screen.
export function squareBox(square: string): Box | null {
  const sq = parseSquare(square);
  const tl = sq && toScreen(sq.col * CELL, sq.row * CELL);
  const br = sq && toScreen((sq.col + 1) * CELL, (sq.row + 1) * CELL);
  return tl && br ? { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } : null;
}

// The first candidate clear of everything to avoid; else the one covering the least.
export function pick<T extends Box>(candidates: T[], avoid: (Box | null)[]): T {
  const solid = avoid.filter((b): b is Box => !!b);
  const cost = (c: Box) => solid.reduce((n, b) => n + overlap(c, b), 0);
  return candidates.find((c) => cost(c) === 0) ?? candidates.reduce((best, c) => (cost(c) < cost(best) ? c : best));
}

// The game UI's panels that sit over the open map (ILI-1546): the mission bar, the band cards,
// the comms log, the team drawer, the map controls and ALPHA's heartbeats. The map's own layers
// (tags, the square's flyout, the ALERT, the prompt) sit beneath these and keep clear of them.
const GAME_UI = '.slot-widget, .slot-band > *, .team-drawer, .comms-strip .slot-satcom, .map-ctl > *, .recentre, .heartbeat-strip, .log-toggle';
export const gameUiBoxes = (): Box[] =>
  [...document.querySelectorAll<HTMLElement>(GAME_UI)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height)
    .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));

// How much of a box the game UI covers, 0 to 1.
export const coveredBy = (b: Box, ui: Box[] = gameUiBoxes()) => (b.w * b.h ? Math.min(1, ui.reduce((n, u) => n + overlap(b, u), 0) / (b.w * b.h)) : 0);
