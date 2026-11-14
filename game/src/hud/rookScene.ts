import * as THREE from 'three';
import type { WireSpec } from './wireScene';

// Castle House's rook (ILI-1531), in the HUD's line language (wireScene): the same lathed body and
// six merlons as the title screen's (castleScene), built for the Castle House site's shared
// renderer (studio.ts), which frames it oversized and cropped in the site's opener and turns it
// with the scroll.

const PROFILE = [
  [0, 0], [0.82, 0], [0.82, 0.14], [0.7, 0.24], [0.66, 0.34], [0.5, 0.46],
  [0.42, 1.36], [0.56, 1.48], [0.62, 1.6], [0.62, 1.86], [0, 1.86],
];

export const ROOK: WireSpec<'idle'> = {
  looks: { idle: { color: '--accent', opacity: 0.95, spin: 0.1 } },
  fov: 30,
  eye: [0, 1.6, 6],
  target: [0, 0.95, 0],
  roll: 0,
  rest: 0.5,
  build: ({ edges }) => {
    edges(new THREE.LatheGeometry(PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 12), 0, 0, 0, 20);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      edges(new THREE.BoxGeometry(0.26, 0.22, 0.14), Math.sin(a) * 0.52, 1.97, Math.cos(a) * 0.52).rotation.y = a;
    }
  },
};
