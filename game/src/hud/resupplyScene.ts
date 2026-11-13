import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// DUSTOFF-2's drop in 3D (ILI-1520): the resupply bundle, an A-22-style cargo bag strapped on a
// skid board, coming down under its cargo chute on four risers. It swings gently as it falls,
// turning slowly; on the ground it settles still. In the HUD's line language (wireScene), and
// in the HUD's green: support, not a strike. Loaded lazily with its panel.
export type DropState = 'inbound' | 'down';

const CANOPY_R = 1.15;
const SKIRT = Math.PI / 2.7; // how far down the dome reaches from its crown
const RIM_Y = CANOPY_R * Math.cos(SKIRT);
const RIM_R = CANOPY_R * Math.sin(SKIRT);
const BAG = { w: 0.8, h: 0.62, d: 0.8, y: -1.55 };

const DROP: WireSpec<DropState> = {
  looks: {
    inbound: { color: '--accent', opacity: 0.9, spin: 0.3 },
    down: { color: '--accent', opacity: 0.65, spin: 0.08 },
  },
  fov: 32,
  eye: [0, 0.7, 6.6],
  target: [0, -0.3, 0],
  roll: 0,
  rest: -0.5,
  build: ({ root, edges, lines }) => {
    // The canopy: a shallow dome, its gores showing as the sphere's meridians, and the vent at the crown.
    edges(new THREE.SphereGeometry(CANOPY_R, 10, 4, 0, Math.PI * 2, 0, SKIRT), 0, 0, 0, 1, root);
    // Four risers from the skirt down to the bag's top corners.
    const top = BAG.y + BAG.h / 2;
    const pts: number[] = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = Math.atan2(sz, sx);
      pts.push(Math.cos(a) * RIM_R, RIM_Y, Math.sin(a) * RIM_R, (sx * BAG.w) / 2.6, top + 0.12, (sz * BAG.d) / 2.6);
      pts.push((sx * BAG.w) / 2.6, top + 0.12, (sz * BAG.d) / 2.6, (sx * BAG.w) / 2, top, (sz * BAG.d) / 2);
    }
    lines(pts, root);
    // The bag, the straps crossing over it, and the skid board under it.
    edges(new THREE.BoxGeometry(BAG.w, BAG.h, BAG.d), 0, BAG.y, 0, 1, root);
    const y0 = BAG.y - BAG.h / 2;
    const y1 = top + 0.001;
    const hw = BAG.w / 2 + 0.001;
    const hd = BAG.d / 2 + 0.001;
    lines([
      // one strap round x = 0, one round z = 0
      0, y1, -hd, 0, y1, hd, 0, y1, hd, 0, y0, hd, 0, y0, -hd, 0, y1, -hd,
      -hw, y1, 0, hw, y1, 0, hw, y1, 0, hw, y0, 0, -hw, y0, 0, -hw, y1, 0,
    ], root);
    edges(new THREE.BoxGeometry(BAG.w + 0.16, 0.08, BAG.d + 0.16), 0, y0 - 0.05, 0, 1, root);
  },
  // Inbound: a slow pendulum under the chute and a gentle bob. Down: still.
  move: (root, t, state) => {
    const k = state === 'inbound' ? 1 : 0;
    root.rotation.z = Math.sin(t * 1.3) * 0.09 * k;
    root.rotation.x = Math.sin(t * 0.9 + 1) * 0.05 * k;
    root.position.y = Math.sin(t * 0.7) * 0.06 * k;
  },
};

export const mount = (host: HTMLElement, stateRef: { current: DropState }, repaint: { current: (() => void) | null }) => mountWire(host, DROP, stateRef, repaint);
