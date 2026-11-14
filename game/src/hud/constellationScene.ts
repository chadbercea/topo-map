import * as THREE from 'three';
import type { WireSpec } from './wireScene';

// The globe and the constellation's three satellites (ILI-1527), in the HUD's line language
// (wireScene): the title screen's globe (castleScene) as a graticule, three tilted orbits round
// it, a satellite lapping each. Built for the Castle House site's shared renderer (studio.ts),
// which frames it in "Who we are" and turns it with the scroll. Under reduced motion the studio
// never calls move, so the satellites hold where they're built.

const GLOBE_R = 3.4;
// Each orbit: radius, tilt (x, z), where its satellite starts (radians) and its lap speed.
const ORBITS = [
  { r: 4.3, tiltX: -1.2, tiltZ: 0.16, from: 3.6, speed: 0.1 },
  { r: 4.9, tiltX: 1.38, tiltZ: -0.42, from: 0.8, speed: 0.16 },
  { r: 5.2, tiltX: -1.02, tiltZ: 0.34, from: 5.4, speed: -0.12 },
];

const ring = (r: number, n: number, place: (x: number, z: number) => [number, number, number]) => {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    pts.push(...place(Math.cos(a) * r, Math.sin(a) * r), ...place(Math.cos(b) * r, Math.sin(b) * r));
  }
  return pts;
};

export const CONSTELLATION: WireSpec<'idle'> = {
  looks: { idle: { color: '--accent', opacity: 0.85, spin: 0.05 } },
  fov: 30,
  eye: [0, 3.2, 14],
  target: [0, 0, 0],
  roll: 0.32, // the globe's axial tilt on the title screen
  rest: 0,
  build: ({ root, edges, lines }) => {
    // The globe: parallels and meridians every 30°.
    const globe: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const a = (lat * Math.PI) / 180;
      const y = GLOBE_R * Math.sin(a);
      globe.push(...ring(GLOBE_R * Math.cos(a), 48, (x, z) => [x, y, z]));
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const c = Math.cos((lon * Math.PI) / 180);
      const s = Math.sin((lon * Math.PI) / 180);
      globe.push(...ring(GLOBE_R, 48, (x, y) => [x * c, y, x * s]));
    }
    lines(globe);

    // Three orbits, tilted, each with its satellite on a carrier that laps it (move).
    ORBITS.forEach((o, i) => {
      const plane = new THREE.Group();
      plane.rotation.set(o.tiltX, 0, o.tiltZ);
      root.add(plane);
      lines(ring(o.r, 120, (x, z) => [x, 0, z]), plane);
      const lap = new THREE.Group();
      lap.name = `lap${i}`;
      lap.rotation.y = o.from;
      plane.add(lap);
      const sat = new THREE.Group();
      sat.position.x = o.r;
      sat.scale.setScalar(1.8);
      lap.add(sat);
      // The bus and two solar wings.
      edges(new THREE.BoxGeometry(0.32, 0.32, 0.44), 0, 0, 0, 1, sat);
      for (const side of [-1, 1]) edges(new THREE.BoxGeometry(0.03, 0.28, 0.68), 0, 0, side * 0.66, 1, sat);
      lines([0, 0, 0.22, 0, 0, 0.32, 0, 0, -0.22, 0, 0, -0.32], sat); // the struts
    });
  },
  move: (root, t) => {
    ORBITS.forEach((o, i) => {
      const lap = root.getObjectByName(`lap${i}`);
      if (lap) lap.rotation.y = o.from + t * o.speed;
    });
  },
};
