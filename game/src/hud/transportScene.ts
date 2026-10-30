import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// RAVEN-6's Three.js scene (ILI-1264): a wireframe Black Hawk-style transport for the exfil
// panel, the counterpart to HAMMER-2's Little Bird (heliScene). Longer and fatter: a cabin with
// its sliding doors, the engine deck on top, the tail pylon with its canted rotor and the
// stabilator, wheels instead of skids. Orange, the exfil's colour. Loaded lazily.
export type TransportState = 'enroute' | 'down' | 'done';

const TRANSPORT: WireSpec<TransportState> = {
  looks: {
    enroute: { color: '#ff8a2a', opacity: 0.9, spin: 0.35 },
    down: { color: '#ff8a2a', opacity: 1, spin: 0.15 },
    done: { color: '#ff8a2a', opacity: 0.6, spin: 0.1 },
  },
  fov: 30,
  eye: [0, 3.4, 11],
  target: [0, 0.1, 0],
  roll: 0.08,
  rest: -0.6,
  build: ({ root, edges, lines }) => {
    // The cabin: a long box, the nose tapering forward of it to the windscreen.
    edges(new THREE.BoxGeometry(2.2, 1, 1.1), 0.1, 0, 0);
    const nose = edges(new THREE.CylinderGeometry(0.42, 0.62, 0.8, 4, 1), 1.6, -0.05, 0);
    nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
    // The windscreen's frame and the chin.
    lines([1.2, 0.5, -0.5, 1.75, 0.15, -0.35, 1.2, 0.5, 0.5, 1.75, 0.15, 0.35, 1.75, 0.15, -0.35, 1.75, 0.15, 0.35]);
    // The sliding cabin doors, one each side.
    for (const z of [-0.555, 0.555]) lines([-0.6, -0.4, z, -0.6, 0.35, z, -0.6, 0.35, z, 0.45, 0.35, z, 0.45, 0.35, z, 0.45, -0.4, z, 0.45, -0.4, z, -0.6, -0.4, z, -0.1, 0.35, z, -0.1, -0.4, z]);
    // The engine deck on the roof, the twin exhausts at its back.
    edges(new THREE.BoxGeometry(1.4, 0.32, 0.8), 0, 0.66, 0);
    for (const z of [-0.3, 0.3]) edges(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6), -0.8, 0.66, z).rotation.z = Math.PI / 2;
    // The tail boom, tapering back to the pylon.
    lines([-1, 0.4, -0.3, -3.6, 0.45, -0.1, -1, 0.4, 0.3, -3.6, 0.45, 0.1, -1, -0.2, 0, -3.6, 0.3, 0]);
    // The tail pylon, swept back, with the canted tail rotor on its side and the stabilator.
    lines([-3.4, 0.45, 0, -3.95, 1.35, 0, -3.6, 0.3, 0, -4.1, 1.35, 0, -3.95, 1.35, 0, -4.1, 1.35, 0]);
    const tail = new THREE.Group();
    tail.position.set(-3.95, 1.0, 0.18);
    tail.rotation.x = 0.35;
    root.add(tail);
    lines([0, -0.55, 0, 0, 0.55, 0, -0.55, 0, 0, 0.55, 0, 0, -0.39, -0.39, 0, 0.39, 0.39, 0, -0.39, 0.39, 0, 0.39, -0.39, 0], tail);
    lines([-3.75, 0.45, -0.8, -3.75, 0.45, 0.8, -3.75, 0.45, -0.8, -3.45, 0.45, -0.8, -3.75, 0.45, 0.8, -3.45, 0.45, 0.8]);
    // The wheels: the main gear on struts forward, the tail wheel under the boom.
    for (const z of [-0.75, 0.75]) {
      lines([0.6, -0.4, z * 0.7, 0.75, -0.8, z]);
      edges(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), 0.75, -0.85, z).rotation.x = Math.PI / 2;
    }
    lines([-2.9, 0.33, 0, -2.95, -0.35, 0]);
    edges(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 6), -2.95, -0.42, 0).rotation.x = Math.PI / 2;
    // The mast and the main rotor: four long blades.
    lines([0, 0.82, 0, 0, 1.15, 0]);
    const rotor = new THREE.Group();
    rotor.position.y = 1.15;
    rotor.rotation.y = Math.PI / 4;
    root.add(rotor);
    lines([-3.2, 0, 0, 3.2, 0, 0, 0, 0, -3.2, 0, 0, 3.2], rotor);
  },
};

export const mount = (host: HTMLElement, stateRef: { current: TransportState }, repaint: { current: (() => void) | null }) => mountWire(host, TRANSPORT, stateRef, repaint);
