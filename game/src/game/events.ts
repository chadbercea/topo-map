import * as Phaser from 'phaser';

// The one channel between Phaser and React. Phaser emits what happened on the map;
// React panels listen, and send commands back the same way.
export const bus = new Phaser.Events.EventEmitter();

export type SceneStatus = { width: number; height: number; renderer: string; pointer: string; layers: string };

export const EV = {
  sceneStatus: 'scene-status',
  mapRect: 'map-rect',
} as const;

// The part of the screen the map gets, between the HUD panels, in CSS px.
export type MapRect = { x: number; y: number; width: number; height: number };

let lastRect: MapRect | null = null;
bus.on(EV.mapRect, (r: MapRect) => (lastRect = r));
export const getMapRect = () => lastRect;

// The scene can emit before React mounts, so keep the latest status for late subscribers.
let lastStatus: SceneStatus | null = null;
bus.on(EV.sceneStatus, (s: SceneStatus) => (lastStatus = s));
export const getSceneStatus = () => lastStatus;
