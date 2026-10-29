import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// REAPER-1's Three.js scene (ILI-1252): a wireframe strike drone for the drone panel, in the same
// line language as ORION-3 and COMMS's backpack (wireScene). Loaded lazily with the panel.
export type DroneState = 'inbound' | 'strike' | 'done';

const DRONE: WireSpec<DroneState> = {
  looks: {
    inbound: { color: '--accent', opacity: 0.9, spin: 0.35 },
    strike: { color: '#e5484d', opacity: 1, spin: 0.9 },
    done: { color: '--dim', opacity: 0.6, spin: 0.1 },
  },
  fov: 30,
  eye: [0, 3.2, 8],
  target: [0, 0, 0],
  roll: 0.1,
  rest: -0.7,
  build: ({ root, edges, lines }) => {
    const body = new THREE.Group();
    body.rotation.y = Math.PI / 2; // nose along +x
    root.add(body);
    // The fuselage, a long tapered tube, and its bulbous nose.
    const tube = edges(new THREE.CylinderGeometry(0.22, 0.14, 3, 8), 0, 0, 0, 1, body);
    tube.rotation.x = Math.PI / 2;
    const nose = edges(new THREE.SphereGeometry(0.26, 8, 4), 0, 0.03, -1.55, 1, body);
    nose.scale.set(1, 0.9, 1.3);
    // The sensor ball under the nose.
    edges(new THREE.SphereGeometry(0.13, 6, 4), 0, -0.26, -1.15, 1, body);
    // Long, thin wings, swept a touch.
    for (const side of [-1, 1]) {
      lines([side * 0.2, 0.05, -0.25, side * 2.6, 0.12, 0.05, side * 2.6, 0.12, 0.05, side * 2.6, 0.12, 0.35, side * 2.6, 0.12, 0.35, side * 0.2, 0.05, 0.3], body);
      // A weapon under each wing.
      edges(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), side * 1.2, -0.18, 0, 1, body).rotation.x = Math.PI / 2;
    }
    // The V-tail, and a ventral fin.
    for (const side of [-1, 1]) lines([0, 0.1, 1.2, side * 0.65, 0.6, 1.5, side * 0.65, 0.6, 1.5, side * 0.65, 0.6, 1.75, side * 0.65, 0.6, 1.75, 0, 0.1, 1.5], body);
    lines([0, -0.12, 1.25, 0, -0.45, 1.55, 0, -0.45, 1.55, 0, -0.12, 1.5], body);
    // The pusher prop at the tail.
    lines([0, 0.45, 1.6, 0, -0.45, 1.6, -0.45, 0, 1.6, 0.45, 0, 1.6], body);
  },
};

export const mount = (host: HTMLElement, stateRef: { current: DroneState }, repaint: { current: (() => void) | null }) => mountWire(host, DRONE, stateRef, repaint);
