import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// The team navigating, in 3D: a lensatic compass lying open. A round body with its bezel ring
// and ticks, the floating dial inside it with the north arrow; at the near edge the rear sight
// with its lens, folded up, and the thumb loop folded out under it. No cover: standing up, its
// window read as a toilet seat (ILI-1293). The body lies flat in x and z, the user's side at +z. In the HUD's line language (wireScene);
// loaded on demand like the other scenes.
export type GearState = 'on';

// A flat ring, r0 to r1, lying in x and z, `d` deep upward from y = 0.
const ring = (r0: number, r1: number, d: number, segs: number) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, r0, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: segs });
  g.rotateX(-Math.PI / 2);
  return g;
};

// A flat 2D outline (x, y pairs) with optional holes, extruded `w` deep and centred on z.
const slab = (pts: number[], w: number, holes: number[][] = []) => {
  const shape = (p: number[], s: THREE.Shape | THREE.Path) => {
    s.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) s.lineTo(p[i], p[i + 1]);
    return s;
  };
  const s = shape(pts, new THREE.Shape()) as THREE.Shape;
  for (const h of holes) s.holes.push(shape(h, new THREE.Path()) as THREE.Path);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  return g;
};

const R = 0.6; // the body's radius
const H = 0.16; // its height

const COMPASS: WireSpec<GearState> = {
  looks: { on: { color: '--accent', opacity: 0.85, spin: 0.25 } },
  fov: 30,
  eye: [0, 1.6, 3.0],
  target: [0, -0.1, 0], // centred on the body, with no cover standing over it
  roll: 0.06,
  rest: -0.75,
  build: ({ root, edges, lines }) => {
    const kit = new THREE.Group();
    kit.position.set(0, -0.25, 0.1);
    root.add(kit);

    // The body: a low drum, only its rims drawn, and the bezel ring on top.
    edges(new THREE.CylinderGeometry(R, R, H, 20), 0, H / 2, 0, 30, kit);
    edges(ring(R - 0.11, R, 0.05, 10), 0, H, 0, 30, kit);
    // The bezel's ticks: sixteen, the four cardinals longer.
    const ticks: number[] = [];
    const ty = H + 0.052;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r0 = i % 4 === 0 ? R - 0.1 : R - 0.06;
      ticks.push(Math.sin(a) * r0, ty, -Math.cos(a) * r0, Math.sin(a) * (R - 0.02), ty, -Math.cos(a) * (R - 0.02));
    }
    lines(ticks, kit);

    // The dial, floating in the body: a disc a little below the bezel, the north arrow on it,
    // pointing at the cover.
    const dy = H - 0.03;
    const dial: number[] = [];
    const DR = 0.4;
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2;
      const a1 = ((i + 1) / 20) * Math.PI * 2;
      dial.push(Math.cos(a0) * DR, dy, Math.sin(a0) * DR, Math.cos(a1) * DR, dy, Math.sin(a1) * DR);
    }
    dial.push(0, dy, -0.3, 0.1, dy, 0.02, 0.1, dy, 0.02, 0, dy, -0.06, 0, dy, -0.06, -0.1, dy, 0.02, -0.1, dy, 0.02, 0, dy, -0.3); // the arrow's head
    dial.push(0, dy, -0.06, 0, dy, 0.28); // its tail
    lines(dial, kit);

    // The rear sight at the near edge, folded up: a narrow plate with the sighting notch cut in
    // its top and the round lens below it.
    const sight = new THREE.Group();
    sight.position.set(0, H, R + 0.02);
    sight.rotation.x = 0.2;
    kit.add(sight);
    edges(slab([-0.13, 0, 0.13, 0, 0.13, 0.42, 0.03, 0.42, 0, 0.36, -0.03, 0.42, -0.13, 0.42], 0.03), 0, 0, 0, 1, sight);
    edges(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10).rotateX(Math.PI / 2), 0, 0.2, 0, 30, sight); // the lens
    edges(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), 0, 0, 0, 1, sight).rotation.z = Math.PI / 2; // its hinge

    // The thumb loop, folded out from under the near edge.
    const loop = new THREE.Group();
    loop.position.set(0, 0, R - 0.08);
    loop.rotation.x = 0.25;
    kit.add(loop);
    edges(ring(0.12, 0.18, 0.025, 6), 0, 0, 0.2, 30, loop);
  },
};

export const mount = (host: HTMLElement, stateRef: { current: GearState }, repaint: { current: (() => void) | null }) => mountWire(host, COMPASS, stateRef, repaint);
