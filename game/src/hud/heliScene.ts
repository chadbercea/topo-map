import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';
import type { DroneState } from './droneScene';

// HAMMER-2's Three.js scene (ILI-1254): a wireframe attack helicopter for its panel, in the
// HUD's line language (wireScene), with the same states as the drone's. Loaded lazily.
const HELI: WireSpec<DroneState> = {
  looks: {
    inbound: { color: '--accent', opacity: 0.9, spin: 0.35 },
    strike: { color: '#e5484d', opacity: 1, spin: 0.9 },
    done: { color: '--dim', opacity: 0.6, spin: 0.1 },
  },
  fov: 30,
  eye: [0, 3, 8.5],
  target: [0, 0.2, 0],
  roll: 0.08,
  rest: -0.6,
  build: ({ root, edges, lines }) => {
    // The narrow body: a tandem cockpit up front, the engine hump behind it.
    const body = edges(new THREE.CylinderGeometry(0.36, 0.3, 2, 8), 0.2, 0, 0);
    body.rotation.z = Math.PI / 2;
    edges(new THREE.SphereGeometry(0.34, 8, 4), 1.25, 0.08, 0).scale.set(1.3, 0.9, 0.9);
    edges(new THREE.BoxGeometry(0.8, 0.3, 0.5), 0, 0.4, 0);
    // The tail boom, its fin and the tail rotor.
    lines([-0.8, 0.05, 0, -2.6, 0.2, 0, -0.8, -0.15, 0, -2.6, 0.12, 0]);
    lines([-2.5, 0.2, 0, -2.75, 0.75, 0, -2.75, 0.75, 0, -2.6, 0.12, 0]);
    lines([-2.7, 0.45, 0.06, -2.7, 0.45, 0.06, -2.7, 0.85, 0.06, -2.7, 0.05, 0.06]);
    // The stub wings with their rocket pods, and the chin gun.
    for (const side of [-1, 1]) {
      lines([0.1, -0.05, side * 0.3, 0.1, -0.05, side * 1.05]);
      edges(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 6), 0.1, -0.2, side * 0.95).rotation.z = Math.PI / 2;
    }
    lines([1.3, -0.25, 0, 1.75, -0.35, 0]);
    // The skids.
    for (const side of [-1, 1]) lines([-0.7, -0.75, side * 0.4, 1.0, -0.75, side * 0.4, -0.3, -0.75, side * 0.4, -0.2, -0.3, side * 0.3, 0.6, -0.75, side * 0.4, 0.5, -0.3, side * 0.3]);
    // The mast and the main rotor: four long blades.
    lines([0, 0.55, 0, 0, 0.85, 0]);
    const rotor = new THREE.Group();
    rotor.position.y = 0.85;
    root.add(rotor);
    lines([-2.6, 0, 0, 2.6, 0, 0, 0, 0, -2.6, 0, 0, 2.6], rotor);
  },
};

export const mount = (host: HTMLElement, stateRef: { current: DroneState }, repaint: { current: (() => void) | null }) => mountWire(host, HELI, stateRef, repaint);
