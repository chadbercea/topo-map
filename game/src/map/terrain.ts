import { contours } from 'd3-contour';
import { WORLD_H, WORLD_W } from './grid';

// Fictional terrain (GDD: complete fiction): seeded fractal noise, so the same seed always
// gives the same ridges and valleys, traced into contour lines like a survey map.

export const SAMPLE = 10; // world units per height sample
export const CONTOUR_STEP = 20; // metres between contour lines
export const INDEX_EVERY = 5; // every 5th line is an index contour, drawn heavier

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// The theater comes in two layers so the map fills any screen edge to edge. The fine layer
// covers the grid and a margin around it: it's what the team walks on and what you look at.
// The coarse layer reaches far past it (tall phones see a lot of ground), cheaply; it only
// shows in the dimmed area outside the grid, under the fine layer. Heights are a function of
// world position, so the two layers agree wherever they overlap.
export type Area = { x: number; y: number; w: number; h: number; sample: number };
export const FINE: Area = { x: -400, y: -400, w: WORLD_W + 800, h: WORLD_H + 800, sample: SAMPLE };
export const COARSE: Area = { x: -3200, y: -4000, w: WORLD_W + 6400, h: WORLD_H + 8000, sample: 60 };

export type Terrain = {
  x0: number; // world position of sample 0
  y0: number;
  sample: number; // world units between samples
  cols: number;
  rows: number;
  heights: Float64Array; // metres, row-major
  min: number;
  max: number;
};

// Height in metres at a world point, before any sampling.
function groundAt(wx: number, wy: number, seed: number) {
  let h = 0;
  let amp = 1;
  let freq = 1 / 400; // ~400 world units per broad feature
  for (let o = 0; o < 5; o++) {
    h += amp * valueNoise(wx * freq, wy * freq, seed + o * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return 900 + h * 520; // ~900–1700 m of relief
}

export function generateTerrain(seed = 7, area: Area = FINE): Terrain {
  const { x: x0, y: y0, sample } = area;
  const cols = Math.round(area.w / sample) + 1;
  const rows = Math.round(area.h / sample) + 1;
  const heights = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const m = groundAt(x0 + i * sample, y0 + j * sample, seed);
      heights[j * cols + i] = m;
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  return { x0, y0, sample, cols, rows, heights, min, max };
}

export type ContourLine = { value: number; index: boolean; rings: [number, number][][] };

// d3-contour treats sample i as a pixel spanning [i, i+1], so shift by half a sample to
// put sample i back at its world position, and clamp the edge rings to the layer.
const toWorld = (v: number, origin: number, sample: number, count: number) =>
  Math.min(origin + (count - 1) * sample, Math.max(origin, origin + (v - 0.5) * sample));

// d3-contour closes every ring along the edge of the data. Those edge runs aren't contours,
// and they'd draw straight lines where one layer ends, so split the rings there.
function openAtEdges(ring: [number, number][], t: Terrain): [number, number][][] {
  const xMax = t.x0 + (t.cols - 1) * t.sample;
  const yMax = t.y0 + (t.rows - 1) * t.sample;
  const edge = ([ax, ay]: [number, number], [bx, by]: [number, number]) =>
    (ax === t.x0 && bx === t.x0) || (ax === xMax && bx === xMax) || (ay === t.y0 && by === t.y0) || (ay === yMax && by === yMax);
  const out: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    if (i > 0 && edge(ring[i - 1], ring[i])) {
      if (run.length > 1) out.push(run);
      run = [];
    }
    run.push(ring[i]);
  }
  if (run.length > 1) out.push(run);
  return out;
}

// Contour lines in world units (rings, or open runs where they meet the edge).
export function traceContours(t: Terrain): ContourLine[] {
  const start = Math.ceil(t.min / CONTOUR_STEP) * CONTOUR_STEP;
  const thresholds: number[] = [];
  for (let v = start; v < t.max; v += CONTOUR_STEP) thresholds.push(v);
  return contours()
    .size([t.cols, t.rows])
    .smooth(true)
    .thresholds(thresholds)(Array.from(t.heights))
    .map((mp) => ({
      value: mp.value,
      index: Math.round(mp.value / CONTOUR_STEP) % INDEX_EVERY === 0,
      rings: mp.coordinates
        .flat()
        .flatMap((ring) => openAtEdges(ring.map(([x, y]) => [toWorld(x, t.x0, t.sample, t.cols), toWorld(y, t.y0, t.sample, t.rows)] as [number, number]), t)),
    }));
}

// Height at a world point, bilinear between samples.
export function heightAt(t: Terrain, x: number, y: number): number {
  const fx = Math.min(Math.max((x - t.x0) / t.sample, 0), t.cols - 1);
  const fy = Math.min(Math.max((y - t.y0) / t.sample, 0), t.rows - 1);
  const i = Math.min(Math.floor(fx), t.cols - 2);
  const j = Math.min(Math.floor(fy), t.rows - 2);
  const u = fx - i;
  const v = fy - j;
  const h = (a: number, b: number) => t.heights[b * t.cols + a];
  return (
    h(i, j) * (1 - u) * (1 - v) + h(i + 1, j) * u * (1 - v) + h(i, j + 1) * (1 - u) * v + h(i + 1, j + 1) * u * v
  );
}

// The fine layer everyone shares: the scene draws it, the sim moves the team over it.
let shared: Terrain | undefined;
export const theater = () => (shared ??= generateTerrain());
// The coarse layer, only drawn (outside the grid, dimmed).
let far: Terrain | undefined;
export const outerTheater = () => (far ??= generateTerrain(7, COARSE));
