import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// The team fighting, in 3D: a wireframe M4 carbine in the HUD's line language (wireScene). A
// short barrel with the A-frame front sight and a flash hider, a ribbed handguard, the flat-top
// upper with its carry handle and charging handle, the lower with the curved 30-round magazine,
// the pistol grip and trigger guard, and the collapsible stock on its buffer tube. The bore runs
// along x, the muzzle at +x. Loaded lazily, like the other scenes.
export type GearState = 'on';

// A flat 2D outline (x, y pairs), extruded `w` deep and centred on z; optional holes cut through it.
const slab = (pts: number[], w: number, holes: number[][] = []) => {
  const shape = (p: number[], s: THREE.Shape | THREE.Path) => {
    s.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) s.lineTo(p[i], p[i + 1]);
    return s;
  };
  const s = shape(pts, new THREE.Shape()) as THREE.Shape;
  for (const h of holes) s.holes.push(shape(h, new THREE.Path()) as THREE.Path);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -w / 2);
  return g;
};

// A round part along x, from x0 to x1, on the bore line.
const along = (r0: number, r1: number, x0: number, x1: number, sides: number) => {
  const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, sides);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
};

const M4: WireSpec<GearState> = {
  looks: { on: { color: '--accent', opacity: 0.85, spin: 0.25 } },
  fov: 22,
  eye: [0, 2.2, 9],
  target: [0, 0, 0],
  roll: 0.06,
  rest: -0.4,
  build: ({ root, edges, lines }) => {
    const gun = new THREE.Group();
    gun.position.y = 0.3; // the bore sits above centre; the magazine hangs below
    root.add(gun);
    const at = (g: THREE.BufferGeometry, threshold = 1) => edges(g, 0, 0, 0, threshold, gun);

    // The flash hider, the short barrel, and the A-frame front sight with its post and bayonet lug.
    at(along(0.055, 0.055, 1.85, 2.05, 6));
    lines([1.9, 0.055, 0, 2.02, 0.055, 0, 1.9, -0.055, 0, 2.02, -0.055, 0], gun);
    at(along(0.038, 0.038, 0.98, 1.85, 6));
    at(slab([1.05, -0.07, 1.25, -0.07, 1.25, 0.07, 1.19, 0.07, 1.17, 0.46, 1.13, 0.46, 1.11, 0.07, 1.05, 0.07], 0.1, [[1.12, 0.12, 1.15, 0.33, 1.18, 0.12]]));
    lines([1.15, 0.33, 0, 1.15, 0.44, 0], gun);
    at(slab([1.1, -0.07, 1.22, -0.07, 1.2, -0.16, 1.12, -0.16], 0.06));

    // The handguard: a ribbed tube in short sections, the delta ring at its back.
    for (let i = 0; i < 4; i++) at(along(0.13, 0.13, 0.08 + i * 0.225, 0.08 + (i + 1) * 0.225, 8));
    at(along(0.16, 0.16, 0.0, 0.08, 8));

    // The flat-top upper receiver, its rail, the ejection port, and the charging handle at the back.
    at(slab([-1.05, -0.1, 0.0, -0.1, 0.0, 0.12, -1.05, 0.12], 0.18));
    at(slab([-1.02, 0.12, -0.02, 0.12, -0.02, 0.16, -1.02, 0.16], 0.12));
    lines([-0.75, 0.0, 0.091, -0.35, 0.0, 0.091, -0.35, 0.0, 0.091, -0.35, 0.08, 0.091, -0.35, 0.08, 0.091, -0.75, 0.08, 0.091, -0.75, 0.08, 0.091, -0.75, 0.0, 0.091], gun);
    lines([-1.05, 0.09, 0, -1.14, 0.09, 0, -1.14, 0.09, -0.1, -1.14, 0.09, 0.1], gun);

    // The carry handle on the rail, the rear sight tower at its back.
    at(slab([-1.0, 0.16, -0.3, 0.16, -0.35, 0.44, -0.84, 0.44, -0.86, 0.53, -0.98, 0.53, -1.0, 0.44], 0.1, [[-0.83, 0.22, -0.44, 0.22, -0.47, 0.37, -0.81, 0.37]]));

    // The lower receiver with its magazine well, and the curved 30-round magazine.
    at(slab([-1.0, -0.1, -0.1, -0.1, -0.1, -0.42, -0.46, -0.42, -0.5, -0.28, -1.0, -0.28], 0.16));
    const front: number[] = [];
    const back: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      front.push(-0.13 + 0.3 * t * t, -0.42 - 0.66 * t);
      back.unshift(-0.43 + 0.24 * t * t, -0.42 - 0.72 * t);
    }
    at(slab([...front, ...back], 0.12), 20);

    // The pistol grip, raked back, and the trigger guard and trigger in front of it.
    at(slab([-1.0, -0.28, -0.8, -0.28, -0.93, -0.82, -1.14, -0.78], 0.14));
    lines([-0.8, -0.32, 0, -0.78, -0.45, 0, -0.78, -0.45, 0, -0.5, -0.45, 0, -0.5, -0.45, 0, -0.48, -0.42, 0, -0.66, -0.28, 0, -0.62, -0.38, 0], gun);

    // The buffer tube out the back, and the adjustable stock slid along it.
    at(along(0.07, 0.07, -1.85, -1.0, 8));
    at(slab([-2.05, 0.13, -1.5, 0.13, -1.46, 0.0, -1.62, -0.1, -1.9, -0.36, -2.05, -0.42], 0.16), 20);
    lines([-1.6, -0.13, 0.081, -1.4, -0.13, 0.081, -1.6, -0.13, -0.081, -1.4, -0.13, -0.081], gun); // the adjustment lever
  },
};

export const mount = (host: HTMLElement, stateRef: { current: GearState }, repaint: { current: (() => void) | null }) => mountWire(host, M4, stateRef, repaint);
