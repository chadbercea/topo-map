import * as THREE from 'three';

// ORION-3's Three.js scene (ILI-1196). Its own module, loaded by OrionAvatar with a dynamic
// import, so Three.js stays out of the main bundle and Rollup can still drop the parts we don't use.
export type AvatarState = 'idle' | 'slewing' | 'tied';

// How each state looks and moves: colour token, line opacity, turn speed (radians a second).
const LOOK: Record<AvatarState, { color: string; opacity: number; spin: number }> = {
  idle: { color: '--accent', opacity: 0.85, spin: 0.22 },
  slewing: { color: '#f2c14e', opacity: 0.95, spin: 0.7 },
  tied: { color: '--dim', opacity: 0.5, spin: 0.03 },
};
const FPS = 24; // a low frame rate: the map's WebGL canvas is the one that matters

// Builds the scene into `host` and runs it; returns the teardown, or null without WebGL.
export function mount(host: HTMLElement, stateRef: { current: AvatarState }, repaint: { current: (() => void) | null }) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0); // transparent: the placeholder's own background shows through
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 50);
  camera.position.set(0, 3.4, 7.6); // a little above, so the wings show their faces
  camera.lookAt(0, -0.15, 0);

  const material = new THREE.LineBasicMaterial({ transparent: true });
  const geometries: { dispose(): void }[] = [];
  const sat = new THREE.Group();
  sat.rotation.z = 0.12; // a slight roll, so it reads as 3D even face-on
  scene.add(sat);

  // Every part is edge lines in one material, the HUD's line language.
  const edges = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, threshold = 1, parent: THREE.Object3D = sat) => {
    const e = new THREE.EdgesGeometry(g, threshold);
    g.dispose();
    geometries.push(e);
    const lines = new THREE.LineSegments(e, material);
    lines.position.set(x, y, z);
    parent.add(lines);
    return lines;
  };
  const lines = (pts: number[], parent: THREE.Object3D = sat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geometries.push(g);
    parent.add(new THREE.LineSegments(g, material));
  };

  // The bus, and a lip round its top.
  edges(new THREE.BoxGeometry(1, 1.3, 1));
  edges(new THREE.BoxGeometry(1.16, 0.12, 1.16), 0, 0.71);
  // The camera barrel, pointing down at the ground, with its lens ring.
  edges(new THREE.CylinderGeometry(0.34, 0.4, 0.7, 8), 0, -1.0);
  edges(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), 0, -1.39, 0, 30);
  // Two solar wings on struts, tilted to the sun, each split into cells.
  const WING = { w: 2.1, d: 0.8, gap: 0.35 };
  for (const side of [-1, 1]) {
    const inner = side * (0.5 + WING.gap);
    const wing = new THREE.Group();
    wing.position.y = 0.1;
    wing.rotation.x = 0.45;
    sat.add(wing);
    edges(new THREE.BoxGeometry(WING.w, 0.04, WING.d), inner + side * (WING.w / 2), 0, 0, 1, wing);
    const cells: number[] = [];
    for (let i = 1; i < 4; i++) {
      const x = inner + side * (WING.w * i) / 4;
      cells.push(x, 0, -WING.d / 2, x, 0, WING.d / 2);
    }
    cells.push(inner, 0, 0, inner + side * WING.w, 0, 0);
    lines(cells, wing);
    lines([side * 0.5, 0.1, 0, inner, 0.1, 0]); // the strut
  }
  // A small antenna mast and its tip.
  lines([0.25, 0.77, 0.25, 0.25, 1.25, 0.25]);
  edges(new THREE.ConeGeometry(0.1, 0.18, 4), 0.25, 1.34, 0.25);

  // Colours come from the HUD's tokens where there's one.
  const css = getComputedStyle(document.documentElement);
  const colorOf = (c: string) => new THREE.Color(c.startsWith('--') ? css.getPropertyValue(c).trim() || '#35d0a5' : c);
  const paint = () => {
    const look = LOOK[stateRef.current];
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
  let spin = LOOK[stateRef.current].spin;
  const draw = () => renderer.render(scene, camera);
  const tick = (now: number) => {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? (now - last) / 1000 : 0;
    if (last && dt < 1 / FPS) return;
    last = now;
    const step = Math.min(dt, 0.25);
    spin += (LOOK[stateRef.current].spin - spin) * Math.min(1, step * 2); // ease between speeds
    t += step;
    sat.rotation.y += spin * step;
    sat.position.y = Math.sin(t * 0.6) * 0.06; // a gentle drift
    draw();
  };
  const running = () => onScreen && !document.hidden && !still.matches;
  const update = () => {
    if (running()) {
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (still.matches) { sat.rotation.y = -0.5; sat.position.y = 0; draw(); } // a still frame
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
  sat.rotation.y = -0.5;
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
