import * as Phaser from 'phaser';

// The one channel between Phaser and React. Phaser emits what happened on the map;
// React panels listen, and send commands back the same way.
export const bus = new Phaser.Events.EventEmitter();

export type SceneStatus = { width: number; height: number; renderer: string; pointer: string; layers: string };

export const EV = {
  sceneStatus: 'scene-status',
  mapRect: 'map-rect',
  camera: 'camera', // the map camera moved or zoomed
  inset: 'inset', // the square card's picture frame opened, moved or closed (InsetRect)
  askHidden: 'ask-hidden', // ALPHA's waiting ask can't be seen on the map (boolean)
  openAsk: 'open-ask', // open ALPHA's waiting ask (from the intel stream's alert)
  panned: 'panned', // HQ panned the map by hand, so it stopped following ALPHA (boolean)
  recentre: 'recentre', // back to ALPHA, and follow it again
  overlays: 'overlays', // the square card or its action panel opened, moved, resized or closed
} as const;

// World to screen (CSS px) for the map's camera, set by the scene, so a panel can sit next
// to a grid square (ILI-1189: an event's card opens beside its square).
let projector: ((x: number, y: number) => { x: number; y: number }) | null = null;
export const setProjector = (p: typeof projector) => (projector = p);
export const toScreen = (x: number, y: number) => projector?.(x, y) ?? null;

// The part of the screen the map gets, between the HUD panels, in CSS px. cover*: the open
// screen the grid covers, below the mission bar, right of a docked intel stream and above the
// bottom-right panels or a phone's dock (ILI-1186).
export type MapRect = { x: number; y: number; width: number; height: number; coverLeft?: number; coverTop?: number; coverBottom?: number; coverRight?: number };

let lastRect: MapRect | null = null;
bus.on(EV.mapRect, (r: MapRect) => (lastRect = r));
export const getMapRect = () => lastRect;

// The larger square (ILI-1179, ILI-1203): the square card reports its picture frame (CSS px)
// when it shows ORION-3's view of the square, or null; the scene draws into it with a second
// camera.
export type InsetRect = { x: number; y: number; width: number; height: number } | null;

// Whether ALPHA's waiting ask is out of sight (ILI-1203): its flag may sit under the square
// card or wait out a mini game, and then the intel stream raises it instead.
let askHidden = false;
bus.on(EV.askHidden, (h: boolean) => (askHidden = h));
export const getAskHidden = () => askHidden;

// The scene can emit before React mounts, so keep the latest status for late subscribers.
let lastStatus: SceneStatus | null = null;
bus.on(EV.sceneStatus, (s: SceneStatus) => (lastStatus = s));
export const getSceneStatus = () => lastStatus;
