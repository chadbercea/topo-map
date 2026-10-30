import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// OVERWATCH's Three.js scene (ILI-1253): a wireframe bolt-action rifle for the sniper panel, in the
// HUD's line language (wireScene). Loaded lazily with the panel.
export type RifleState = 'aiming' | 'firing' | 'done';

const RIFLE: WireSpec<RifleState> = {
  looks: {
    aiming: { color: '--accent', opacity: 0.9, spin: 0.3 },
    firing: { color: '#e5484d', opacity: 1, spin: 0.3 },
    done: { color: '--dim', opacity: 0.6, spin: 0.1 },
  },
  fov: 26,
  eye: [0, 2.2, 9],
  target: [0, 0, 0],
  roll: 0.08,
  rest: -0.35,
  build: ({ edges, lines }) => {
    // Barrel and its muzzle brake, along x.
    edges(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), 1.2, 0.1, 0).rotation.z = Math.PI / 2;
    edges(new THREE.BoxGeometry(0.22, 0.12, 0.12), 2.55, 0.1, 0);
    // The receiver, the bolt handle sticking out, and the magazine.
    edges(new THREE.BoxGeometry(1.1, 0.24, 0.2), -0.3, 0.1, 0);
    lines([-0.1, 0.12, 0.1, -0.1, 0.12, 0.38, -0.1, 0.12, 0.38, -0.1, 0.02, 0.44]);
    edges(new THREE.BoxGeometry(0.22, 0.32, 0.14), -0.2, -0.18, 0);
    // The scope on its rings.
    edges(new THREE.CylinderGeometry(0.11, 0.11, 1.2, 8), -0.15, 0.48, 0).rotation.z = Math.PI / 2;
    edges(new THREE.CylinderGeometry(0.15, 0.11, 0.2, 8), 0.5, 0.48, 0).rotation.z = Math.PI / 2;
    lines([-0.5, 0.22, 0, -0.5, 0.37, 0, 0.15, 0.22, 0, 0.15, 0.37, 0]);
    // The stock, the grip and the trigger guard.
    lines([-0.85, 0.2, 0, -2.2, 0.15, 0, -2.2, 0.15, 0, -2.2, -0.45, 0, -2.2, -0.45, 0, -1.6, -0.25, 0, -1.6, -0.25, 0, -0.85, -0.02, 0]);
    lines([-0.75, -0.02, 0, -0.95, -0.45, 0, -0.55, -0.02, 0, -0.5, -0.2, 0, -0.5, -0.2, 0, -0.7, -0.2, 0]);
    // The bipod, folded down.
    lines([1.2, 0.04, 0, 1.0, -0.6, 0.25, 1.2, 0.04, 0, 1.0, -0.6, -0.25]);
  },
};

export const mount = (host: HTMLElement, stateRef: { current: RifleState }, repaint: { current: (() => void) | null }) => mountWire(host, RIFLE, stateRef, repaint);
