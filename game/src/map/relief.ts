import type { Terrain } from './terrain';
import { METRES_PER_UNIT } from './grid';

// Shaded relief: light from the north-west across the same height samples the contours
// use, so both views line up with the grid exactly. One RGBA pixel per sample.
const LIGHT = (() => {
  const v = [-1, -1, 1.4];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

export function hillshade(t: Terrain): Uint8ClampedArray {
  const px = new Uint8ClampedArray(t.cols * t.rows * 4);
  const h = (i: number, j: number) =>
    t.heights[Math.min(t.rows - 1, Math.max(0, j)) * t.cols + Math.min(t.cols - 1, Math.max(0, i))];
  const z = 1 / (t.sample * METRES_PER_UNIT);
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const dx = (h(i + 1, j) - h(i - 1, j)) * z * 0.5;
      const dy = (h(i, j + 1) - h(i, j - 1)) * z * 0.5;
      const n = Math.hypot(dx, dy, 1);
      const lit = Math.max(0, (-dx * LIGHT[0] - dy * LIGHT[1] + LIGHT[2]) / n);
      const elev = (h(i, j) - t.min) / (t.max - t.min);
      const k = (j * t.cols + i) * 4;
      // Dark slate to muted teal, lit faces brighter, high ground a touch lighter.
      const v = 0.25 + 0.75 * lit;
      px[k] = 11 + v * (28 + elev * 20);
      px[k + 1] = 15 + v * (60 + elev * 40);
      px[k + 2] = 13 + v * (52 + elev * 30);
      px[k + 3] = 255;
    }
  }
  return px;
}
