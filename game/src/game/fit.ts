// How the camera fits the map (ILI-1180), shared by MapScene and the e2e helpers so they
// agree. The whole theater fills the viewport, 100vw by 100vh, with the HUD floating over
// it. It always covers both edges: running past the viewport is fine, falling short of it
// isn't (Chad, 2026-10-26). A strike closes in on its square inside the space between the
// panels, so every cell can be tapped.

import { CELL, WORLD_H, WORLD_W } from '../map/grid';

export type Rect = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };

// The open screen the grid must cover (ILI-1186): below the mission bar, right of a docked
// intel stream, above the bottom-right panels or a phone's dock. All of the screen by default.
export type Cover = { left: number; top: number; bottom: number };
const open = (screen: Size, cover?: Cover) => ({ left: cover?.left ?? 0, top: cover?.top ?? 0, bottom: cover?.bottom ?? screen.h });

// zoom, and the screen point the view's centre lands on.
export function fitCamera(screen: Size, area: Rect, view: Rect, margin: number, cover?: Cover) {
  const whole = view.w === WORLD_W && view.h === WORLD_H;
  const c = open(screen, cover);
  if (whole) return { zoom: Math.max((screen.w - c.left) / WORLD_W, (c.bottom - c.top) / WORLD_H), sx: (c.left + screen.w) / 2, sy: (c.top + c.bottom) / 2 };
  const zoom = Math.max(0.01, Math.min((area.w - margin * 2) / view.w, (area.h - margin * 2) / view.h));
  return { zoom, sx: area.x + area.w / 2, sy: area.y + area.h / 2 };
}

type Point = { x: number; y: number };

// Keep the camera's centre where the grid always covers the open screen (on an axis where it
// fits exactly, that pins the centre). bounds: the world the screen must stay inside; the AO
// by default, PAN when HQ pans by hand.
export function clampCenter(c: Point, screen: Size, zoom: number, cover?: Cover, bounds: Rect = { x: 0, y: 0, w: WORLD_W, h: WORLD_H }): Point {
  const o = open(screen, cover);
  const left = (screen.w / 2 - o.left) / zoom;
  const right = screen.w / 2 / zoom;
  const top = (screen.h / 2 - o.top) / zoom;
  const bottom = (o.bottom - screen.h / 2) / zoom;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return { x: clamp(c.x, bounds.x + left, bounds.x + bounds.w - right), y: clamp(c.y, bounds.y + top, bounds.y + bounds.h - bottom) };
}

// How far HQ can pan by hand (ILI-1205): two squares past the AO on every side, where the
// detailed terrain is still drawn.
export const PAN: Rect = { x: -2 * CELL, y: -2 * CELL, w: WORLD_W + 4 * CELL, h: WORLD_H + 4 * CELL };

// The centre that puts ALPHA in the middle of the open map.
export function centreOn(alpha: Point, area: Rect, screen: Size, zoom: number, cover?: Cover): Point {
  const want = { x: alpha.x - (area.x + area.w / 2 - screen.w / 2) / zoom, y: alpha.y - (area.y + area.h / 2 - screen.h / 2) / zoom };
  return clampCenter(want, screen, zoom, cover);
}

// Follow ALPHA only when it needs to (ILI-1181): while ALPHA is well inside the open map
// (the space between the panels, less an edge band) the camera stays put; once it drifts
// into that band or out of view, the camera re-centres it in the open map.
export function followCenter(center: Point, alpha: Point, area: Rect, screen: Size, zoom: number, cover?: Cover): Point {
  const band = Math.max(32, Math.min(area.w, area.h) * 0.15);
  const sx = (alpha.x - center.x) * zoom + screen.w / 2;
  const sy = (alpha.y - center.y) * zoom + screen.h / 2;
  const inside = sx >= area.x + band && sx <= area.x + area.w - band && sy >= area.y + band && sy <= area.y + area.h - band;
  return inside ? center : centreOn(alpha, area, screen, zoom, cover);
}
