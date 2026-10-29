import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// ALPHA's end of the link in 3D (ILI-1236, ILI-1246): the SATCOM backpack the team carries. A
// rucksack on a frame, shoulder straps and a waist belt on the back, webbing and pockets on the
// front, and on top the flat-panel SATCOM antenna, folded open and tilted up at RELAY-7; a short
// whip off one side and the handset on its coiled cord off the other. Loaded on demand by
// CommsStrip, like ORION-3's scene.
export type LinkState = 'idle' | 'incoming' | 'sending' | 'tied';

// A smooth run of points as line segments: f(0..1) -> [x, y, z].
const curve = (f: (t: number) => [number, number, number], n = 12) => {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(...f(i / n), ...f((i + 1) / n));
  return pts;
};

const TERMINAL: WireSpec<LinkState> = {
  looks: {
    idle: { color: '--accent', opacity: 0.8, spin: 0.2 },
    incoming: { color: '#7dffd4', opacity: 1, spin: 0.55 }, // a call waiting: brighter, quicker
    sending: { color: '#f2c14e', opacity: 0.95, spin: 0.4 },
    tied: { color: '--dim', opacity: 0.5, spin: 0.03 },
  },
  fov: 30,
  eye: [0, 1.9, 6.8],
  target: [0, 0.4, 0],
  roll: 0.06,
  rest: -0.6,
  build: ({ root, edges, lines }) => {
    const kit = new THREE.Group();
    kit.position.y = 0.15;
    root.add(kit);
    // The pack: its main bag (its front is +z, the wearer's back against -z), the lid over it.
    const P = { w: 1.0, h: 1.25, d: 0.5, y: -0.35 };
    const top = P.y + P.h / 2;
    const bottom = P.y - P.h / 2;
    const front = P.d / 2;
    const back = -P.d / 2;
    edges(new THREE.BoxGeometry(P.w, P.h, P.d), 0, P.y, 0, 1, kit);
    edges(new THREE.BoxGeometry(P.w + 0.06, 0.14, P.d + 0.1), 0, top + 0.04, 0.03, 1, kit);
    // The lid's buckle straps, down the front.
    lines([-0.28, top - 0.03, front + 0.08, -0.28, top - 0.3, front + 0.001, 0.28, top - 0.03, front + 0.08, 0.28, top - 0.3, front + 0.001], kit);
    // The front pocket, with rows of webbing across it.
    const F = { w: 0.72, h: 0.6, d: 0.16, y: P.y - 0.22 };
    const fz = front + F.d / 2;
    edges(new THREE.BoxGeometry(F.w, F.h, F.d), 0, F.y, fz, 1, kit);
    const web: number[] = [];
    for (const dy of [0.16, 0, -0.16]) web.push(-F.w / 2, F.y + dy, fz + F.d / 2 + 0.001, F.w / 2, F.y + dy, fz + F.d / 2 + 0.001);
    lines(web, kit);
    // Side pockets.
    for (const s of [-1, 1]) edges(new THREE.BoxGeometry(0.14, 0.62, 0.36), s * (P.w / 2 + 0.07), P.y - 0.18, 0.02, 1, kit);
    // The frame on the back: two rails a little proud of the bag, a crossbar near the top.
    const fb = back - 0.04;
    lines([-0.3, bottom - 0.04, fb, -0.3, top + 0.1, fb, 0.3, bottom - 0.04, fb, 0.3, top + 0.1, fb, -0.3, top - 0.08, fb, 0.3, top - 0.08, fb], kit);
    // Shoulder straps, padded: each a band from the top of the frame round the shoulder and down
    // to the bottom corner, bowed back where the soldier would be.
    const strap = (x: number, t: number): [number, number, number] => [x + Math.sign(x) * 0.08 * t, top - 0.02 - t * (P.h - 0.12), fb - 0.06 - Math.sin(t * Math.PI) * 0.42];
    for (const x of [-0.24, 0.24]) {
      for (const dx of [-0.07, 0.07]) lines(curve((t) => strap(x + dx, t)), kit);
      lines([x - 0.07, top - 0.02, fb - 0.06, x + 0.07, top - 0.02, fb - 0.06], kit);
    }
    lines([...strap(-0.17, 0.35), ...strap(0.17, 0.35)], kit); // the sternum strap across the chest
    // The waist belt, wrapping forward round the hips.
    for (const s of [-1, 1]) {
      for (const dy of [0.05, -0.05]) lines(curve((t) => [s * (0.1 + t * 0.62), bottom + 0.12 + dy, fb - 0.06 - Math.sin(t * Math.PI * 0.6) * 0.28], 8), kit);
    }
    // The SATCOM antenna: a flat panel on a hinge at the lid's front edge, folded open like a lid
    // and leaning back so its face looks up at the satellite, a grid of patch elements on it.
    const hinge = new THREE.Group();
    hinge.position.set(0, top + 0.12, front - 0.02);
    hinge.rotation.x = -0.6; // open, its face tilted up
    kit.add(hinge);
    const A = { w: 0.86, h: 0.72, d: 0.05 };
    edges(new THREE.BoxGeometry(A.w, A.h, A.d), 0, A.h / 2 + 0.04, 0, 1, hinge);
    const face = A.d / 2 + 0.001;
    const grid: number[] = [];
    for (let i = 1; i < 4; i++) {
      const gx = -A.w / 2 + (A.w * i) / 4;
      grid.push(gx, 0.08, face, gx, A.h, face);
    }
    for (let i = 1; i < 3; i++) {
      const gy = 0.04 + (A.h * i) / 3;
      grid.push(-A.w / 2 + 0.04, gy, face, A.w / 2 - 0.04, gy, face);
    }
    lines(grid, hinge);
    edges(new THREE.CylinderGeometry(0.035, 0.035, A.w * 0.8, 6), 0, 0.02, 0, 1, hinge).rotation.z = Math.PI / 2; // the hinge barrel
    // A whip, out of the left side pocket.
    const wx = -(P.w / 2 + 0.07);
    lines([wx, P.y + 0.13, 0.08, wx - 0.05, P.y + 1.2, 0.04, wx - 0.05, P.y + 1.2, 0.04, wx - 0.12, P.y + 1.85, 0], kit);
    // The handset, hanging off the right side pocket on its coiled cord.
    const hx = P.w / 2 + 0.07;
    lines(curve((t) => [hx + 0.1 + Math.cos(t * Math.PI * 14) * 0.05, P.y + 0.1 - t * 0.45, 0.1 + Math.sin(t * Math.PI * 14) * 0.05], 56), kit);
    const handset = new THREE.Group();
    handset.position.set(hx + 0.12, P.y - 0.52, 0.12);
    handset.rotation.z = 0.25;
    kit.add(handset);
    edges(new THREE.BoxGeometry(0.1, 0.36, 0.08), 0, 0, 0, 1, handset);
    edges(new THREE.BoxGeometry(0.14, 0.08, 0.12), 0, 0.17, 0, 1, handset);
  },
};

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export const mount = (host: HTMLElement, stateRef: { current: LinkState }, repaint: { current: (() => void) | null }) => mountWire(host, TERMINAL, stateRef, repaint);
