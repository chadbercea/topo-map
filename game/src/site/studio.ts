import * as THREE from 'three';
import { buildWire, type WireSpec } from '../hud/wireScene';
import type { SceneKey, Shot } from './content';

// The Castle House site's one WebGL renderer (ILI-1526). Every framed model on the page (a
// "stage") is a plain 2D canvas in the page's flow, so it scrolls with the page natively and never
// swims. Each frame the studio renders each on-screen stage in turn into its own offscreen WebGL
// canvas and copies the picture across: one GL context for the whole site, however many stages.
//
// A stage's picture is driven by scroll: how far the stage has travelled up the screen (0 as its
// top enters at the bottom, 1 as its foot leaves at the top) turns the model, dollies the camera
// and pans the frame, per its shot (content.ts). Stages off screen aren't drawn; with nothing on
// screen the loop sleeps until the next scroll. Reduced motion holds every model at its mid-scroll
// frame. Pixel ratio is capped and every stage has a pixel budget, so phones stay smooth.

type Spec = WireSpec<string>;
const LOAD: Record<SceneKey, () => Promise<Spec>> = {
  satellite: () => import('../hud/orionScene').then((m) => m.ORION as Spec),
  uav: () => import('../hud/droneScene').then((m) => m.DRONE as Spec),
  rotary: () => import('../hud/heliScene').then((m) => m.HELI as Spec),
  airlift: () => import('../hud/transportScene').then((m) => m.TRANSPORT as Spec),
  rifle: () => import('../hud/m4Scene').then((m) => m.M4 as Spec),
  marksman: () => import('../hud/rifleScene').then((m) => m.RIFLE as Spec),
  medical: () => import('../hud/ifakScene').then((m) => m.IFAK as Spec),
  comms: () => import('../hud/terminalScene').then((m) => m.TERMINAL as Spec),
  nav: () => import('../hud/mapScene').then((m) => m.COMPASS as Spec),
  drop: () => import('../hud/resupplyScene').then((m) => m.DROP as Spec),
};

const MAX_RATIO = 1.5; // device pixels per CSS pixel, at most
const MAX_PIXELS = 1_600_000; // per stage: a full-bleed stage on a big screen drops its ratio to fit
const IDLE_FPS = 30; // the slow idle turn; scrolling draws every frame

type Stage = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  shot: Shot;
  spec?: Spec;
  scene?: THREE.Scene;
  root?: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  dispose?: () => void;
  w: number;
  h: number;
  on: boolean;
  p: number; // the eased scroll position
  key: string; // what was last drawn, so an unchanged frame isn't drawn again
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (k: number) => k * k * (3 - 2 * k);

let renderer: THREE.WebGLRenderer | null | undefined; // undefined: not tried; null: no WebGL
let camera: THREE.PerspectiveCamera;
const stages = new Set<Stage>();
let seen: IntersectionObserver;
let sizes: ResizeObserver;
let raf = 0;
let last = 0;
let lastIdle = 0;
let quiet = 0; // frames in a row with nothing to draw
let t = 0;
const still = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
const idle = () => !still?.matches && !automated;

function boot() {
  if (renderer !== undefined) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1); // sizes below are device pixels already
    renderer.setScissorTest(true);
  } catch {
    renderer = null;
    return null;
  }
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) for (const s of stages) if (s.host === e.target) s.on = e.isIntersecting;
      wake();
    },
    { rootMargin: '10% 0px' },
  );
  sizes = new ResizeObserver((entries) => {
    for (const e of entries) for (const s of stages) if (s.host === e.target) fit(s);
    wake();
  });
  addEventListener('scroll', wake, { passive: true, capture: true }); // capture: the side-scrolling rails too
  still?.addEventListener('change', () => {
    for (const s of stages) s.key = '';
    wake();
  });
  return renderer;
}

// The stage's backing store: its CSS size at a capped pixel ratio, inside the pixel budget.
function fit(s: Stage) {
  const { width, height } = s.host.getBoundingClientRect();
  let ratio = Math.min(devicePixelRatio || 1, MAX_RATIO);
  if (width * height * ratio * ratio > MAX_PIXELS) ratio = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  if (w === s.w && h === s.h) return;
  s.w = s.canvas.width = w;
  s.h = s.canvas.height = h;
  s.key = '';
}

function wake() {
  quiet = 0;
  if (!raf && [...stages].some((s) => s.on)) {
    last = 0;
    raf = requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  raf = 0;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const moving = idle();
  const idleDue = moving && now - lastIdle >= 1000 / IDLE_FPS;
  if (idleDue) {
    t += Math.min(0.1, (now - lastIdle) / 1000);
    lastIdle = now;
  }
  const vh = innerHeight;
  const vw = innerWidth;
  let drew = false;
  let settling = false;
  for (const s of stages) {
    if (!s.on || !s.scene) continue;
    // All reads first (rects), then GL work; nothing here writes layout.
    const r = s.host.getBoundingClientRect();
    const target = moving ? clamp((vh - r.top) / (vh + r.height)) : 0.5;
    // Side-scrolling rails: how far the stage sits off the screen's centre line, -1 to 1.
    const side = moving ? Math.max(-1, Math.min(1, (r.left + r.width / 2 - vw / 2) / vw)) : 0;
    s.p = s.key ? lerp(s.p, target, 1 - Math.exp(-dt * 9)) : target; // eased, so a flick glides
    if (Math.abs(s.p - target) > 0.0005) settling = true;
    const key = `${s.p.toFixed(4)}|${side.toFixed(3)}|${s.w}x${s.h}|${moving && s.shot.spin !== 0 ? t.toFixed(3) : ''}`;
    if (key === s.key) continue;
    s.key = key;
    draw(s, s.p, side);
    drew = true;
  }
  quiet = drew || settling ? 0 : quiet + 1;
  // Keep going while anything moves; with the idle turn on, keep the slow loop; otherwise sleep
  // after a short quiet spell until the next scroll or resize.
  if ([...stages].some((s) => s.on) && (moving || quiet < 20)) raf = requestAnimationFrame(tick);
}

const dir = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3();
const aim = new THREE.Vector3();

function draw(s: Stage, p: number, side: number) {
  const gl = renderer!;
  const spec = s.spec!;
  const shot = s.shot;
  const k = smooth(p);
  const size = gl.getSize(new THREE.Vector2());
  if (size.x < s.w || size.y < s.h) gl.setSize(Math.max(size.x, s.w), Math.max(size.y, s.h), false); // grows, never shrinks
  const H = gl.domElement.height;
  gl.setViewport(0, 0, s.w, s.h);
  gl.setScissor(0, 0, s.w, s.h);
  gl.clear();

  // The frame: zoom 1 fits the whole model; more crops in. The camera keeps the spec's own angle,
  // lifted by the shot's pitch, and backs off far enough for the zoom on this screen's shape.
  const aspect = s.w / s.h;
  camera.fov = shot.fov ?? spec.fov;
  camera.aspect = aspect;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fit = Math.min(half, Math.atan(Math.tan(half) * aspect));
  const zoom = lerp(shot.zoom[0], shot.zoom[1], k);
  const dist = s.radius / Math.sin(fit) / zoom;
  dir.set(...spec.eye).sub(aim.set(...spec.target)).normalize();
  const pitch = shot.pitch ? lerp(shot.pitch[0], shot.pitch[1], k) : 0;
  right.crossVectors(up, dir).normalize();
  dir.applyAxisAngle(right, -pitch).normalize();
  const pan = shot.pan ?? [0, 0, 0, 0];
  aim.copy(s.center)
    .addScaledVector(right, -lerp(pan[0], pan[1], k) * s.radius)
    .addScaledVector(up, -lerp(pan[2], pan[3], k) * s.radius);
  camera.position.copy(aim).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - s.radius * 3);
  camera.far = dist + s.radius * 3;
  camera.up.set(0, 1, 0).applyAxisAngle(dir, shot.roll ?? 0);
  camera.lookAt(aim);
  camera.updateProjectionMatrix();

  // The turn: the spec's rest pose, the shot's scroll-driven turn, the swipe, and the idle drift.
  const root = s.root!;
  root.rotation.y = spec.rest + lerp(shot.yaw[0], shot.yaw[1], k) + side * 0.9 + t * (shot.spin ?? 0.12);
  if (spec.move && idle()) spec.move(root, t, Object.keys(spec.looks)[0]);

  gl.render(s.scene!, camera);
  s.ctx.clearRect(0, 0, s.w, s.h);
  s.ctx.drawImage(gl.domElement, 0, H - s.h, s.w, s.h, 0, 0, s.w, s.h); // GL's origin is bottom-left
}

// Puts a shot on a stage element; returns its teardown. Without WebGL the stage stays empty.
export function stage(host: HTMLElement, shot: Shot): () => void {
  const gl = boot();
  if (!gl) return () => {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  host.appendChild(canvas);
  const s: Stage = { host, canvas, ctx, shot, center: new THREE.Vector3(), radius: 1, w: 0, h: 0, on: false, p: 0.5, key: '' };
  stages.add(s);
  let dead = false;
  LOAD[shot.scene]()
    .then((spec) => {
      if (dead) return;
      const { root, material, dispose } = buildWire(spec);
      const look = spec.looks[shot.state ?? Object.keys(spec.looks)[0]] ?? Object.values(spec.looks)[0];
      const css = getComputedStyle(document.documentElement);
      const c = shot.color ?? look.color;
      material.color.set(c.startsWith('--') ? css.getPropertyValue(c).trim() || '#35d0a5' : c);
      material.opacity = shot.opacity ?? look.opacity;
      const scene = new THREE.Scene();
      scene.add(root);
      root.rotation.y = spec.rest;
      const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
      s.center.copy(sphere.center);
      s.radius = sphere.radius || 1;
      Object.assign(s, { spec, scene, root, dispose });
      host.dataset.ready = '';
      wake();
    })
    .catch(() => {}); // the chunk didn't load: the stage stays empty
  fit(s);
  seen.observe(host);
  sizes.observe(host);
  return () => {
    dead = true;
    stages.delete(s);
    seen.unobserve(host);
    sizes.unobserve(host);
    s.dispose?.();
    canvas.remove();
  };
}
