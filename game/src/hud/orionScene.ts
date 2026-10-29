import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// ORION-3's Three.js scene (ILI-1196). Its own module, loaded by OrionAvatar with a dynamic
// import, so Three.js stays out of the main bundle and Rollup can still drop the parts we don't use.
// The loop, the material and the teardown are shared with COMMS's terminal (wireScene, ILI-1236).
export type AvatarState = 'idle' | 'slewing' | 'tied';

const ORION: WireSpec<AvatarState> = {
  // How each state looks and moves: colour token, line opacity, turn speed (radians a second).
  looks: {
    idle: { color: '--accent', opacity: 0.85, spin: 0.22 },
    slewing: { color: '#f2c14e', opacity: 0.95, spin: 0.7 },
    tied: { color: '--dim', opacity: 0.5, spin: 0.03 },
  },
  fov: 30,
  eye: [0, 3.4, 7.6], // a little above, so the wings show their faces
  target: [0, -0.15, 0],
  roll: 0.12,
  rest: -0.5,
  build: ({ root: sat, edges, lines }) => {
    // The bus, and a lip round its top.
    edges(new THREE.BoxGeometry(1, 1.3, 1));
    edges(new THREE.BoxGeometry(1.16, 0.12, 1.16), 0, 0.71);
    // The camera barrel, pointing down at the ground, with its lens ring.
    edges(new THREE.CylinderGeometry(0.34, 0.4, 0.7, 8), 0, -1.0);
    edges(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), 0, -1.39, 0, 30);
    // Two solar wings on struts, tilted to the sun, each split into cells.
    const WING = { w: 2.1, d: 0.8, gap: 0.35 };
    for (const side of [-1, 1]) {
      const inner = side * (0.5 + WING.gap);
      const wing = new THREE.Group();
      wing.position.y = 0.1;
      wing.rotation.x = 0.45;
      sat.add(wing);
      edges(new THREE.BoxGeometry(WING.w, 0.04, WING.d), inner + side * (WING.w / 2), 0, 0, 1, wing);
      const cells: number[] = [];
      for (let i = 1; i < 4; i++) {
        const x = inner + side * (WING.w * i) / 4;
        cells.push(x, 0, -WING.d / 2, x, 0, WING.d / 2);
      }
      cells.push(inner, 0, 0, inner + side * WING.w, 0, 0);
      lines(cells, wing);
      lines([side * 0.5, 0.1, 0, inner, 0.1, 0]); // the strut
    }
    // A small antenna mast and its tip.
    lines([0.25, 0.77, 0.25, 0.25, 1.25, 0.25]);
    edges(new THREE.ConeGeometry(0.1, 0.18, 4), 0.25, 1.34, 0.25);
  },
};

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export const mount = (host: HTMLElement, stateRef: { current: AvatarState }, repaint: { current: (() => void) | null }) => mountWire(host, ORION, stateRef, repaint);
