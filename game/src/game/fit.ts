// How the camera fits the map (ILI-1180), shared by MapScene and the e2e helpers so they
// agree. The whole theater fills the viewport, 100vw by 100vh, with the HUD floating over
// it. It always covers both edges: running past the viewport is fine, falling short of it
// isn't (Chad, 2026-10-26). A strike closes in on its square inside the space between the
// panels, so every cell can be tapped.

import { WORLD_H, WORLD_W } from '../map/grid';

export type Rect = { x: number; y: number; w: number; h: number };

// zoom, and the screen point the view's centre lands on.
export function fitCamera(screen: { w: number; h: number }, area: Rect, view: Rect, margin: number) {
  const whole = view.w === WORLD_W && view.h === WORLD_H;
  if (whole) return { zoom: Math.max(screen.w / WORLD_W, screen.h / WORLD_H), sx: screen.w / 2, sy: screen.h / 2 };
  const zoom = Math.max(0.01, Math.min((area.w - margin * 2) / view.w, (area.h - margin * 2) / view.h));
  return { zoom, sx: area.x + area.w / 2, sy: area.y + area.h / 2 };
}

type Point = { x: number; y: number };

// Keep the camera's centre where the view stays inside the grid, so it always covers the
// screen (on an axis where it fits exactly, that pins the centre).
export function clampCenter(c: Point, screen: { w: number; h: number }, zoom: number): Point {
  const hw = screen.w / 2 / zoom;
  const hh = screen.h / 2 / zoom;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return { x: clamp(c.x, hw, WORLD_W - hw), y: clamp(c.y, hh, WORLD_H - hh) };
}

// Follow ALPHA only when it needs to (ILI-1181): while ALPHA is well inside the open map
// (the space between the panels, less an edge band) the camera stays put; once it drifts
// into that band or out of view, the camera re-centres it in the open map.
export function followCenter(center: Point, alpha: Point, area: Rect, screen: { w: number; h: number }, zoom: number): Point {
  const band = Math.max(32, Math.min(area.w, area.h) * 0.15);
  const sx = (alpha.x - center.x) * zoom + screen.w / 2;
  const sy = (alpha.y - center.y) * zoom + screen.h / 2;
  const inside = sx >= area.x + band && sx <= area.x + area.w - band && sy >= area.y + band && sy <= area.y + area.h - band;
  if (inside) return center;
  const want = { x: alpha.x - (area.x + area.w / 2 - screen.w / 2) / zoom, y: alpha.y - (area.y + area.h / 2 - screen.h / 2) / zoom };
  return clampCenter(want, screen, zoom);
}
