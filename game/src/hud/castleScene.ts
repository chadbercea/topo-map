import * as THREE from 'three';

// Castle House's idle terminal (ILI-1283), in the HUD's line language: the rook, front and
// centre, turning slowly; most of the globe behind it in a faint graticule; two satellites on
// their orbits, ORION-3 in orange. Each frame it reports where ORION-3 is on screen, so its ping
// (Intro.tsx) can sit on it. Loaded lazily, like the other wireframes.
//
// Two canvases (ILI-1290): the globe and satellites at the back, which the title screen blurs,
// and the rook in front, sharp. START (focus) folds the rook away and flies the camera in on
// ORION-3.

const FPS = 30;
const GLOBE_R = 3.4;
const GLOBE_AT = new THREE.Vector3(0, -2.2, -2.5);

export type OrionSpot = { x: number; y: number; visible: boolean };

const FOCUS_MS = 900;
const ROOK_OUT_MS = 320;
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

export type Castle = { stop(): void; focus(): void };

export function mountCastle(back: HTMLElement, front: HTMLElement, onOrion: (p: OrionSpot) => void, still: boolean): Castle | null {
  const renderers: THREE.WebGLRenderer[] = [];
  try {
    for (const host of [back, front]) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      r.setClearColor(0x000000, 0);
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      host.appendChild(r.domElement);
      renderers.push(r);
    }
  } catch {
    renderers.forEach((r) => (r.dispose(), r.domElement.remove()));
    return null;
  }
  const host = back;

  const css = getComputedStyle(document.documentElement);
  const accent = new THREE.Color(css.getPropertyValue('--accent').trim() || '#35d0a5');
  const line = (color: THREE.Color | string, opacity: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const bright = line(accent, 0.95);
  const faint = line(accent, 0.16);
  const orbitLine = line(accent, 0.22);
  const orange = line('#ff8a2a', 1);
  const dim = line(accent, 0.55);
  const disposables: { dispose(): void }[] = [bright, faint, orbitLine, orange, dim];

  const scene = new THREE.Scene(); // the globe and satellites
  const fore = new THREE.Scene(); // the rook
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  const edges = (g: THREE.BufferGeometry, m: THREE.Material, threshold = 1) => {
    const e = new THREE.EdgesGeometry(g, threshold);
    g.dispose();
    disposables.push(e);
    return new THREE.LineSegments(e, m);
  };
  const loop = (pts: THREE.Vector3[], m: THREE.Material) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    disposables.push(g);
    return new THREE.LineLoop(g, m);
  };
  const circle = (r: number, n = 96) => Array.from({ length: n }, (_, i) => new THREE.Vector3(Math.cos((i / n) * Math.PI * 2) * r, 0, Math.sin((i / n) * Math.PI * 2) * r));

  // The globe: parallels and meridians every 15°, and a ring on the theater.
  const globe = new THREE.Group();
  globe.position.copy(GLOBE_AT);
  globe.rotation.z = 0.32;
  for (let lat = -75; lat <= 75; lat += 15) {
    const a = (lat * Math.PI) / 180;
    const ring = loop(circle(GLOBE_R * Math.cos(a)), faint);
    ring.position.y = GLOBE_R * Math.sin(a);
    globe.add(ring);
  }
  for (let lon = 0; lon < 180; lon += 15) {
    const m = loop(circle(GLOBE_R).map((p) => new THREE.Vector3(p.x, p.z, 0)), faint);
    m.rotation.y = (lon * Math.PI) / 180;
    globe.add(m);
  }
  const theater = loop(circle(0.16, 24), dim);
  const lat = (34 * Math.PI) / 180;
  const lon = (40 * Math.PI) / 180;
  const n = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  theater.position.copy(n.clone().multiplyScalar(GLOBE_R * 1.002));
  theater.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  globe.add(theater);
  scene.add(globe);

  // Two orbits, tilted, around the globe.
  const orbit = (r: number, tiltX: number, tiltZ: number) => {
    const o = new THREE.Group();
    o.position.copy(GLOBE_AT);
    o.rotation.set(tiltX, 0, tiltZ);
    o.add(loop(circle(r, 160), orbitLine));
    scene.add(o);
    return o;
  };
  const satellite = (m: THREE.Material, s: number) => {
    const g = new THREE.Group();
    g.add(edges(new THREE.BoxGeometry(0.16 * s, 0.16 * s, 0.22 * s), m));
    for (const side of [-1, 1]) {
      const panel = edges(new THREE.BoxGeometry(0.34 * s, 0.015 * s, 0.14 * s), m);
      panel.position.x = side * 0.27 * s;
      g.add(panel);
    }
    return g;
  };
  const orionOrbit = orbit(4.3, -1.2, 0.16); // its near side rides high over the globe
  const orion = satellite(orange, 1.2);
  orionOrbit.add(orion);
  const otherOrbit = orbit(4.9, 1.38, -0.42);
  const other = satellite(dim, 1);
  otherOrbit.add(other);

  // The rook: a lathed body, and six merlons round its top.
  const rook = new THREE.Group();
  const profile = [
    [0, 0], [0.82, 0], [0.82, 0.14], [0.7, 0.24], [0.66, 0.34], [0.5, 0.46],
    [0.42, 1.36], [0.56, 1.48], [0.62, 1.6], [0.62, 1.86], [0, 1.86],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  rook.add(edges(new THREE.LatheGeometry(profile, 12), bright, 20));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const merlon = edges(new THREE.BoxGeometry(0.26, 0.22, 0.14), bright);
    merlon.position.set(Math.sin(a) * 0.52, 1.97, Math.cos(a) * 0.52);
    merlon.rotation.y = a;
    rook.add(merlon);
  }
  rook.position.set(0, -0.55, 1.2);
  rook.rotation.x = 0.12;
  fore.add(rook);

  const home = new THREE.Vector3();
  const homeLook = new THREE.Vector3(0, -0.1, 0);
  const resize = () => {
    const w = host.clientWidth || innerWidth;
    const h = host.clientHeight || innerHeight;
    renderers.forEach((r) => r.setSize(w, h, false));
    camera.aspect = w / h;
    // A narrow screen steps back, so the rook and the globe still fit across it.
    const dist = camera.aspect < 1 ? 11 / Math.max(0.45, camera.aspect) : 9.5;
    home.set(0, 1.1, dist);
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  // Is ORION-3 hidden behind the globe? The line from the eye to it passes through the sphere.
  const occluded = (p: THREE.Vector3) => {
    const from = camera.position;
    const d = p.clone().sub(from);
    const len = d.length();
    d.normalize();
    const t = GLOBE_AT.clone().sub(from).dot(d);
    if (t <= 0 || t >= len) return false;
    return from.clone().add(d.multiplyScalar(t)).distanceTo(GLOBE_AT) < GLOBE_R;
  };

  const world = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const near = new THREE.Vector3();
  const aim = new THREE.Vector3();
  let focusAt: number | null = null; // when START was pressed
  const jump = still || matchMedia('(prefers-reduced-motion: reduce)').matches; // no flight: straight there
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    const t = still ? 0 : now / 1000;
    rook.rotation.y = 0.5 + t * 0.35;
    globe.rotation.y = t * 0.05;
    // ORION-3 drifts to and fro along the high, near arc of its orbit, clear of the rook, so it's
    // always there to pick; the other one laps.
    const oa = Math.PI / 2 - 0.75 + 0.35 * Math.sin(t * 0.08); // up and to the right of the rook
    orion.position.set(Math.cos(oa) * 4.3, 0, Math.sin(oa) * 4.3);
    orion.rotation.y = -oa;
    const ob = 4 + t * 0.16;
    other.position.set(Math.cos(ob) * 4.9, 0, Math.sin(ob) * 4.9);
    other.rotation.y = -ob;
    // The camera: at home over the rook, or flying in to sit off ORION-3's shoulder, the
    // globe's limb curving away under it.
    orion.getWorldPosition(world);
    const k = focusAt === null ? 0 : jump ? 1 : ease((now - focusAt) / FOCUS_MS);
    const out = camera.aspect < 1 ? 6.2 : 4.6;
    near.set(world.x * 0.4, world.y + 0.7, world.z + out);
    eye.lerpVectors(home, near, k);
    look.lerpVectors(homeLook, aim.copy(world).setY(world.y - 1.1), k); // ORION-3 high, the limb under it
    camera.position.copy(eye);
    camera.lookAt(look);
    const r = focusAt === null ? 1 : jump ? 0 : 1 - ease((now - focusAt) / ROOK_OUT_MS);
    rook.visible = r > 0.01;
    rook.scale.setScalar(Math.max(0.01, r));
    renderers[0].render(scene, camera);
    renderers[1].render(fore, camera);
    const hidden = occluded(world);
    const p = world.clone().project(camera);
    onOrion({ x: ((p.x + 1) / 2) * host.clientWidth, y: ((1 - p.y) / 2) * host.clientHeight, visible: !hidden && p.z < 1 });
  };
  raf = requestAnimationFrame(frame);

  return {
    focus: () => void (focusAt ??= performance.now()),
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      disposables.forEach((d) => d.dispose());
      renderers.forEach((r) => (r.dispose(), r.domElement.remove()));
    },
  };
}
