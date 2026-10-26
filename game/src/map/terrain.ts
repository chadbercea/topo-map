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

export type Terrain = {
  cols: number;
  rows: number;
  heights: Float64Array; // metres, row-major
  min: number;
  max: number;
};

export function generateTerrain(seed = 7): Terrain {
  const cols = WORLD_W / SAMPLE + 1;
  const rows = WORLD_H / SAMPLE + 1;
  const heights = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let h = 0;
      let amp = 1;
      let freq = 1 / 40; // ~400 world units per broad feature
      for (let o = 0; o < 5; o++) {
        h += amp * valueNoise(i * freq, j * freq, seed + o * 101);
        amp *= 0.5;
        freq *= 2;
      }
      const m = 900 + h * 520; // ~900–1700 m of relief
      heights[j * cols + i] = m;
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  return { cols, rows, heights, min, max };
}

export type ContourLine = { value: number; index: boolean; rings: [number, number][][] };

// d3-contour treats sample i as a pixel spanning [i, i+1], so shift by half a sample to
// put sample i back at world i * SAMPLE, and clamp the edge rings to the world.
const toWorld = (v: number, max: number) => Math.min(max, Math.max(0, (v - 0.5) * SAMPLE));

// Contour rings in world units.
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
      rings: mp.coordinates.flat().map((ring) => ring.map(([x, y]) => [toWorld(x, WORLD_W), toWorld(y, WORLD_H)] as [number, number])),
    }));
}
