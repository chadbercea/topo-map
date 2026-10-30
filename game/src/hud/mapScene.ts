import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// The team navigating, in 3D: a folded field map, partly open on the ground. Four accordion panels
// at alternating slight angles with a crease between each, a grid and a few contour rings on them,
// the route across in a dashed line with a marker on it, and a lensatic compass on one corner. In
// the HUD's line language (wireScene); loaded on demand like the other scenes.
export type GearState = 'on';

// The sheet: panels side by side along x, its depth along z, its creases up and down in y.
const W = 0.9; // a panel's width
const D = 0.68; // half the sheet's depth
const FOLDS = [-2, -1, 0, 1, 2].map((i) => i * W); // the sheet's edges and creases
const LIFT = [0, 0.3, 0, 0.3, 0]; // the height at each
const lift = (x: number) => {
  const i = Math.min(3, Math.max(0, Math.floor((x - FOLDS[0]) / W)));
  const t = (x - FOLDS[i]) / W;
  return LIFT[i] + (LIFT[i + 1] - LIFT[i]) * t;
};
// A point on the sheet, a hair above it so the ink sits on the paper.
const on = (x: number, z: number): [number, number, number] => [x, lift(x) + 0.004, z];

// A run of points across the sheet as line segments, split finely so it follows the folds.
const ink = (pts: [number, number][], n = 4) => {
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    for (let k = 0; k < n; k++) out.push(...on(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n), ...on(ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n));
  }
  return out;
};

const MAP: WireSpec<GearState> = {
  looks: { on: { color: '--accent', opacity: 0.85, spin: 0.25 } },
  fov: 26,
  eye: [0, 4.3, 5.9],
  target: [0, 0, 0],
  roll: 0.05,
  rest: -0.35,
  build: ({ root, edges, lines }) => {
    // The sheet's outline, and the creases across it.
    lines(ink([[FOLDS[0], -D], [FOLDS[4], -D], [FOLDS[4], D], [FOLDS[0], D], [FOLDS[0], -D]], 4));
    for (const x of FOLDS.slice(1, 4)) lines(ink([[x, -D], [x, D]], 1));
    // The grid: the creases stand in for eastings; two northings across the sheet.
    const grid: number[] = [];
    for (const z of [-D / 3, D / 3]) grid.push(...ink([[FOLDS[0], z], [FOLDS[4], z]], 4));
    lines(grid);
    // Contours: rings round a hilltop, and a smaller knoll, a little uneven like the ground.
    const ring = (cx: number, cz: number, rx: number, rz: number, wob: number, ph: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = 1 + wob * Math.sin(a * 3 + ph) + wob * 0.5 * Math.cos(a * 2);
        pts.push([cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r]);
      }
      return ink(pts, 1);
    };
    for (const s of [1, 0.66, 0.33]) lines(ring(-0.55, -0.08, 0.95 * s, 0.48 * s, 0.12, 0.4));
    for (const s of [1, 0.5]) lines(ring(1.15, 0.2, 0.45 * s, 0.3 * s, 0.1, 2));
    // The route: a dashed line across the sheet, round the hill.
    const route: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      route.push([-1.65 + t * 3.3, 0.5 - t * 0.85 + Math.sin(t * Math.PI * 2) * 0.12]);
    }
    const dashes: number[] = [];
    for (let i = 0; i < route.length - 1; i += 2) dashes.push(...ink([route[i], route[i + 1]], 2));
    lines(dashes);
    // The marker on the route: a small upturned triangle, the team's position.
    const [mx, mz] = route[15];
    const my = lift(mx) + 0.004;
    lines([mx - 0.15, my, mz + 0.12, mx + 0.15, my, mz + 0.12, mx + 0.15, my, mz + 0.12, mx, my, mz - 0.15, mx, my, mz - 0.15, mx - 0.15, my, mz + 0.12]);
    lines([mx, my, mz, mx, my + 0.4, mz, mx, my + 0.4, mz, mx + 0.2, my + 0.33, mz, mx + 0.2, my + 0.33, mz, mx, my + 0.26, mz]); // a flag on a pin above it, so it reads from the side
    // The lensatic compass, resting flat on the sheet's near corner: its body, its open lid, its needle.
    const compass = new THREE.Group();
    compass.position.set(1.45, lift(1.45) + 0.04, 0.38);
    compass.rotation.z = Math.atan2(LIFT[3] - LIFT[4], W); // lying on the panel's slope
    root.add(compass);
    edges(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 10), 0, 0, 0, 1, compass);
    const lid = new THREE.Group();
    lid.position.set(0, 0.035, -0.22);
    lid.rotation.x = -1.2; // folded up, sighting forward
    compass.add(lid);
    edges(new THREE.BoxGeometry(0.3, 0.02, 0.36), 0, 0, -0.18, 1, lid);
    lines([0, 0.036, 0.15, 0, 0.036, -0.15], compass); // the needle
  },
};

export const mount = (host: HTMLElement, stateRef: { current: GearState }, repaint: { current: (() => void) | null }) => mountWire(host, MAP, stateRef, repaint);
