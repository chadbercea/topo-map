// How the camera fits the map (ILI-1180), shared by MapScene and the e2e helpers so they
// agree. The whole theater fills the viewport, 100vw by 100vh, with the HUD floating over
// it: on a landscape screen it covers both edges (cropping the longer side). A portrait
// phone fills the width instead, centred in the space between the panels, since covering
// its height would leave two columns of eight on screen. A strike closes in on its square
// inside the space between the panels, so every cell can be tapped.

import { WORLD_H, WORLD_W } from '../map/grid';

export type Rect = { x: number; y: number; w: number; h: number };

// zoom, and the screen point the view's centre lands on.
export function fitCamera(screen: { w: number; h: number }, area: Rect, view: Rect, margin: number) {
  const whole = view.w === WORLD_W && view.h === WORLD_H;
  if (whole && screen.h > screen.w) return { zoom: screen.w / WORLD_W, sx: screen.w / 2, sy: area.y + area.h / 2 };
  if (whole) return { zoom: Math.max(screen.w / WORLD_W, screen.h / WORLD_H), sx: screen.w / 2, sy: screen.h / 2 };
  const zoom = Math.max(0.01, Math.min((area.w - margin * 2) / view.w, (area.h - margin * 2) / view.h));
  return { zoom, sx: area.x + area.w / 2, sy: area.y + area.h / 2 };
}
