import * as THREE from 'three';

// The HUD's little Three.js wireframes (ILI-1196, ILI-1236): ORION-3 and the team's SATCOM
// backpack (ILI-1246). Each is a model in edge lines of one material, on a transparent background, turning
// slowly at a low frame rate; its state sets the colour and the speed. Loaded only through the
// avatars' dynamic imports, so Three.js stays out of the main bundle.

// How a state looks and moves: colour (a HUD token, or a hex), line opacity, turn speed (radians a second).
export type Look = { color: string; opacity: number; spin: number };

export type WireKit = {
  root: THREE.Group;
  // A solid's edges, placed at x, y, z under `parent` (the model by default).
  edges: (g: THREE.BufferGeometry, x?: number, y?: number, z?: number, threshold?: number, parent?: THREE.Object3D) => THREE.LineSegments;
  // Loose line segments, as pairs of points.
  lines: (pts: number[], parent?: THREE.Object3D) => void;
};

export type WireSpec<S extends string> = {
  looks: Record<S, Look>;
  fov: number;
  eye: [number, number, number];
  target: [number, number, number];
  roll: number; // a slight roll, so it reads as 3D even face-on
  rest: number; // the turn it's drawn at when still
  build: (kit: WireKit) => void;
};

const FPS = 24; // a low frame rate: the map's WebGL canvas is the one that matters
// Under test automation (Playwright sets navigator.webdriver) the wireframes hold a still frame:
// CI renders WebGL in software, and several turning scenes at once slowed the long flows to
// their time limits. Players never see this.
const AUTOMATED = typeof navigator !== 'undefined' && navigator.webdriver === true;

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export function mountWire<S extends string>(host: HTMLElement, spec: WireSpec<S>, stateRef: { current: S }, repaint: { current: (() => void) | null }) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0); // transparent: the panel's own background shows through
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.fov, 1.5, 0.1, 50);
  camera.position.set(...spec.eye);
  camera.lookAt(...spec.target);

  const material = new THREE.LineBasicMaterial({ transparent: true });
  const geometries: { dispose(): void }[] = [];
  const root = new THREE.Group();
  root.rotation.z = spec.roll;
  scene.add(root);

  // Every part is edge lines in one material, the HUD's line language.
  const edges: WireKit['edges'] = (g, x = 0, y = 0, z = 0, threshold = 1, parent = root) => {
    const e = new THREE.EdgesGeometry(g, threshold);
    g.dispose();
    geometries.push(e);
    const segs = new THREE.LineSegments(e, material);
    segs.position.set(x, y, z);
    parent.add(segs);
    return segs;
  };
  const lines: WireKit['lines'] = (pts, parent = root) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geometries.push(g);
    parent.add(new THREE.LineSegments(g, material));
  };
  spec.build({ root, edges, lines });

  // Colours come from the HUD's tokens where there's one.
  const css = getComputedStyle(document.documentElement);
  const colorOf = (c: string) => new THREE.Color(c.startsWith('--') ? css.getPropertyValue(c).trim() || '#35d0a5' : c);
  const paint = () => {
    const look = spec.looks[stateRef.current];
    material.color.copy(colorOf(look.color));
    material.opacity = look.opacity;
  };
  paint();

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  // The loop: slow, at a low frame rate, and only while it can be seen.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let onScreen = true;
  let raf = 0;
  let last = 0;
  let t = 0;
  let spin = spec.looks[stateRef.current].spin;
  const draw = () => renderer.render(scene, camera);
  const tick = (now: number) => {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? (now - last) / 1000 : 0;
    if (last && dt < 1 / FPS) return;
    last = now;
    const step = Math.min(dt, 0.25);
    spin += (spec.looks[stateRef.current].spin - spin) * Math.min(1, step * 2); // ease between speeds
    t += step;
    root.rotation.y += spin * step;
    root.position.y = Math.sin(t * 0.6) * 0.06; // a gentle drift
    draw();
  };
  const running = () => onScreen && !document.hidden && !still.matches && !AUTOMATED;
  const update = () => {
    if (running()) {
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (still.matches || AUTOMATED) { root.rotation.y = spec.rest; root.position.y = 0; draw(); } // a still frame
    }
  };
  repaint.current = () => { paint(); if (!raf) draw(); };

  const sizes = new ResizeObserver(() => { resize(); if (!raf) draw(); });
  sizes.observe(host);
  const seen = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); });
  seen.observe(host);
  document.addEventListener('visibilitychange', update);
  still.addEventListener('change', update);
  resize();
  root.rotation.y = spec.rest;
  draw();
  update();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    sizes.disconnect();
    seen.disconnect();
    document.removeEventListener('visibilitychange', update);
    still.removeEventListener('change', update);
    for (const g of geometries) g.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss(); // give the context back: the map's canvas needs WebGL more
    canvas.remove();
  };
}
