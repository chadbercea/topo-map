import * as THREE from 'three';
import { mountWire, type WireSpec } from './wireScene';

// ALPHA's end of the link in 3D (ILI-1236): a manpack SATCOM terminal, the way a team in the field
// talks to HQ today. A radio body with a folding dish on a short mast aimed at RELAY-7, and a
// whip for line-of-sight. Loaded on demand by CommsStrip, like ORION-3's scene.
export type LinkState = 'idle' | 'incoming' | 'sending' | 'tied';

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
    kit.position.x = -0.15; // the dish reaches right: centre the whole kit on the turn
    root.add(kit);
    // The radio: its body, a front panel with a display, keypad and vents, and two knobs on top.
    const B = { w: 1.5, h: 0.85, d: 0.55, y: -0.6 };
    const top = B.y + B.h / 2;
    const front = B.d / 2 + 0.001;
    edges(new THREE.BoxGeometry(B.w, B.h, B.d), 0, B.y, 0, 1, kit);
    lines(
      [
        // the display
        -0.6, -0.32, front, -0.05, -0.32, front,
        -0.05, -0.32, front, -0.05, -0.52, front,
        -0.05, -0.52, front, -0.6, -0.52, front,
        -0.6, -0.52, front, -0.6, -0.32, front,
        // the keypad
        -0.6, -0.68, front, -0.05, -0.68, front,
        -0.6, -0.84, front, -0.05, -0.84, front,
        -0.32, -0.62, front, -0.32, -0.9, front,
        // the vents
        0.2, -0.4, front, 0.6, -0.4, front,
        0.2, -0.55, front, 0.6, -0.55, front,
        0.2, -0.7, front, 0.6, -0.7, front,
        0.2, -0.85, front, 0.6, -0.85, front,
      ],
      kit,
    );
    edges(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6), -0.5, top + 0.06, 0, 1, kit);
    edges(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), -0.28, top + 0.05, 0, 1, kit);
    // The whip, a little bent at the top.
    lines([-0.66, top, -0.1, -0.68, top + 0.9, -0.1, -0.68, top + 0.9, -0.1, -0.74, top + 1.6, -0.1], kit);
    // The mast, its hinge, and the folding dish on it, tilted up at the sky.
    const mast = { x: 0.45, y: top + 0.55 };
    lines([mast.x, top, 0, mast.x, mast.y, 0], kit);
    edges(new THREE.BoxGeometry(0.12, 0.1, 0.12), mast.x, mast.y, 0, 1, kit);
    const dish = new THREE.Group();
    dish.position.set(mast.x, mast.y, 0);
    dish.rotation.z = -0.75;
    dish.rotation.x = 0.25;
    kit.add(dish);
    edges(new THREE.CylinderGeometry(0.85, 0.1, 0.28, 10, 1, true), 0, 0.14, 0, 1, dish);
    // The feed on its three struts, out in front of the dish.
    const struts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + 0.3;
      struts.push(Math.cos(a) * 0.85, 0.28, Math.sin(a) * 0.85, 0, 0.72, 0);
    }
    lines(struts, dish);
    edges(new THREE.BoxGeometry(0.1, 0.1, 0.1), 0, 0.74, 0, 1, dish);
  },
};

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export const mount = (host: HTMLElement, stateRef: { current: LinkState }, repaint: { current: (() => void) | null }) => mountWire(host, TERMINAL, stateRef, repaint);
