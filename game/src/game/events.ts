import * as Phaser from 'phaser';

// The one channel between Phaser and React. Phaser emits what happened on the map;
// React panels listen, and send commands back the same way.
export const bus = new Phaser.Events.EventEmitter();

export type SceneStatus = { width: number; height: number; renderer: string; pointer: string; layers: string };

export const EV = {
  sceneStatus: 'scene-status',
  mapRect: 'map-rect',
  camera: 'camera', // the map camera moved or zoomed
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

// Where ORION-3's inset sits (ILI-1179): a square in the map's top-right corner, so the
// tactical map stays put while the satellite looks. When the grid is width-bound (a phone in
// portrait) it goes in the spare room above the grid instead of over it. Phaser draws into
// it; React frames it.
const GRID_ASPECT = 1000 / 1600; // world height over width
export function insetRect(r: MapRect) {
  const above = (r.height - Math.min(r.height, (r.width - 16) * GRID_ASPECT)) / 2 - 16; // the grid keeps an 8 px margin
  const size = Math.round(above >= 96 ? Math.min(280, above) : Math.max(96, Math.min(280, r.width * 0.4, r.height * 0.55)));
  return { x: r.x + r.width - size - 8, y: r.y + 8, size };
}

// The scene can emit before React mounts, so keep the latest status for late subscribers.
let lastStatus: SceneStatus | null = null;
bus.on(EV.sceneStatus, (s: SceneStatus) => (lastStatus = s));
export const getSceneStatus = () => lastStatus;
