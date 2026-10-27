import * as Phaser from 'phaser';

// The one channel between Phaser and React. Phaser emits what happened on the map;
// React panels listen, and send commands back the same way.
export const bus = new Phaser.Events.EventEmitter();

export type SceneStatus = { width: number; height: number; renderer: string; pointer: string; layers: string };

export const EV = {
  sceneStatus: 'scene-status',
  mapRect: 'map-rect',
  camera: 'camera', // the map camera moved or zoomed
  inset: 'inset', // the zoomed segment opened, moved or closed (InsetLayout | null)
} as const;

// World to screen (CSS px) for the map's camera, set by the scene, so a panel can sit next
// to a grid square (ILI-1189: an event's card opens beside its square).
let projector: ((x: number, y: number) => { x: number; y: number }) | null = null;
export const setProjector = (p: typeof projector) => (projector = p);
export const toScreen = (x: number, y: number) => projector?.(x, y) ?? null;

// The part of the screen the map gets, between the HUD panels, in CSS px. cover*: the open
// screen the grid covers, below the mission bar, right of a docked intel stream and above the
// bottom-right panels or a phone's dock (ILI-1186).
export type MapRect = { x: number; y: number; width: number; height: number; coverLeft?: number; coverTop?: number; coverBottom?: number };

let lastRect: MapRect | null = null;
bus.on(EV.mapRect, (r: MapRect) => (lastRect = r));
export const getMapRect = () => lastRect;

// The zoomed segment and its card (ILI-1179, ILI-1201): a zoomed view of the square in a top
// corner of the open map, with the square's card hanging under it (beside it when the map is
// narrow, as on a phone). The scene picks the corner away from the square and ALPHA, places
// its second camera in the view and announces the layout; React frames it and fills the card.
export type InsetLayout = { side: 'left' | 'right'; view: { x: number; y: number; size: number }; card: { x: number; y: number; width: number; maxHeight: number } };

export function insetLayout(r: MapRect, side: 'left' | 'right'): InsetLayout {
  const top = r.y + 8;
  const left = side === 'left';
  if (r.width >= 600) {
    const width = 260;
    const size = Math.round(Math.max(96, Math.min(width, r.height * 0.42)));
    const x = left ? r.x + 8 : r.x + r.width - 8 - size;
    const cardX = left ? r.x + 8 : r.x + r.width - 8 - width;
    const cardY = top + size + 6;
    return { side, view: { x, y: top, size }, card: { x: cardX, y: cardY, width, maxHeight: r.y + r.height - 8 - cardY } };
  }
  const size = 96;
  const width = Math.min(260, r.width - 16 - size - 6);
  const x = left ? r.x + 8 : r.x + r.width - 8 - size;
  const cardX = left ? x + size + 6 : x - 6 - width;
  return { side, view: { x, y: top, size }, card: { x: cardX, y: top, width, maxHeight: r.height - 16 } };
}

let lastInset: InsetLayout | null = null;
bus.on(EV.inset, (l: InsetLayout | null) => (lastInset = l));
export const getInset = () => lastInset;

// The scene can emit before React mounts, so keep the latest status for late subscribers.
let lastStatus: SceneStatus | null = null;
bus.on(EV.sceneStatus, (s: SceneStatus) => (lastStatus = s));
export const getSceneStatus = () => lastStatus;
