import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// The team healing a wounded operator, in 3D: an IFAK, the rip-away trauma pouch. A rounded pouch
// with its zipper running round the edge and two pull tabs, a big medical cross on the front, MOLLE
// webbing on the back; a CAT tourniquet tucked half out of the top, its windlass rod across the
// strap, and a rolled pressure bandage beside it. In the HUD's line language (wireScene).
export type GearState = 'on';

// A rounded rectangle, w by h with corner radius r, centred on the origin.
const rounded = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
};

const IFAK: WireSpec<GearState> = {
  looks: { on: { color: '--accent', opacity: 0.85, spin: 0.25 } },
  fov: 30,
  eye: [0, 1.1, 4.4],
  target: [0, 0.12, 0],
  roll: 0.06,
  rest: -0.45,
  build: ({ root, edges, lines }) => {
    const kit = new THREE.Group();
    kit.position.y = -0.1;
    root.add(kit);
    // The pouch: a rounded slab standing upright, its front +z, the back (against the vest) -z.
    const P = { w: 1.3, h: 0.95, d: 0.46, r: 0.2 };
    const front = P.d / 2;
    const back = -P.d / 2;
    const top = P.h / 2;
    const body = new THREE.ExtrudeGeometry(rounded(P.w, P.h, P.r), { depth: P.d, bevelEnabled: false, curveSegments: 4 });
    body.translate(0, 0, -P.d / 2);
    edges(body, 0, 0, 0, 30, kit);
    // The zipper, round the edge at mid-depth: a seam proud of the sides.
    const zip = new THREE.ExtrudeGeometry(rounded(P.w + 0.04, P.h + 0.04, P.r + 0.02), { depth: 0.04, bevelEnabled: false, curveSegments: 4 });
    zip.translate(0, 0, -0.02);
    edges(zip, 0, 0, 0, 30, kit);
    // Its two pull tabs, hanging off the top corners.
    for (const s of [-1, 1]) {
      const tab = new THREE.Group();
      tab.position.set(s * (P.w / 2 - 0.12), top + 0.02, 0);
      tab.rotation.z = s * -0.5;
      kit.add(tab);
      edges(new THREE.BoxGeometry(0.06, 0.05, 0.08), 0, 0.02, 0, 1, tab); // the slider
      edges(new THREE.BoxGeometry(0.05, 0.2, 0.02), 0, 0.15, 0, 1, tab); // the pull loop
    }
    // The medical cross on the front, raised a touch off the face.
    const c = 0.15; // half the arm's width
    const L = 0.36; // the arm's reach from the centre
    const cross = new THREE.Shape();
    cross.moveTo(-c, -L);
    cross.lineTo(c, -L);
    cross.lineTo(c, -c);
    cross.lineTo(L, -c);
    cross.lineTo(L, c);
    cross.lineTo(c, c);
    cross.lineTo(c, L);
    cross.lineTo(-c, L);
    cross.lineTo(-c, c);
    cross.lineTo(-L, c);
    cross.lineTo(-L, -c);
    cross.lineTo(-c, -c);
    cross.closePath();
    edges(new THREE.ExtrudeGeometry(cross, { depth: 0.04, bevelEnabled: false }), 0, -0.02, front, 1, kit);
    // MOLLE on the back: two straps running down it, tacked across at three heights, clear of the cross.
    const molle: number[] = [];
    const bz = back - 0.02;
    for (const x of [-0.48, 0.48]) {
      for (const dx of [-0.07, 0.07]) molle.push(x + dx, top - 0.06, bz, x + dx, -top - 0.1, bz);
      for (const y of [0.25, 0, -0.25]) molle.push(x - 0.07, y, bz, x + 0.07, y, bz);
    }
    lines(molle, kit);
    // The tourniquet, half out of the top: its strap a flat loop leaning out of the zip, the
    // windlass rod across the loop with its caps on the ends.
    const tq = new THREE.Group();
    tq.position.set(-0.2, top + 0.05, 0);
    tq.rotation.z = 0.35;
    kit.add(tq);
    const strap = new THREE.Shape();
    strap.absarc(0, 0, 0.2, 0, Math.PI, false);
    strap.lineTo(-0.2, -0.3);
    strap.lineTo(0.2, -0.3);
    strap.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.13, 0, Math.PI, false);
    hole.lineTo(-0.13, -0.3);
    hole.lineTo(0.13, -0.3);
    hole.closePath();
    strap.holes.push(hole);
    const sg = new THREE.ExtrudeGeometry(strap, { depth: 0.12, bevelEnabled: false, curveSegments: 5 });
    sg.translate(0, 0.22, -0.06);
    edges(sg, 0, 0, 0, 30, tq);
    edges(new THREE.CylinderGeometry(0.035, 0.035, 0.66, 6), 0, 0.3, 0.1, 1, tq).rotation.z = Math.PI / 2; // the windlass rod
    for (const s of [-1, 1]) edges(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 6), s * 0.33, 0.3, 0.1, 1, tq).rotation.z = Math.PI / 2;
    // The pressure bandage, rolled, lying along the pouch's right side.
    const bx = P.w / 2 + 0.22;
    const by = -P.h / 2 + 0.16;
    edges(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10), bx, by, 0.05, 1, kit).rotation.x = Math.PI / 2;
    edges(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), bx, by, 0.05, 1, kit).rotation.x = Math.PI / 2; // its core
  },
};

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export const mount = (host: HTMLElement, stateRef: { current: GearState }, repaint: { current: (() => void) | null }) => mountWire(host, IFAK, stateRef, repaint);
