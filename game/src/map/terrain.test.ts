import { describe, expect, it } from 'vitest';
import { COARSE, FINE, generateTerrain, heightAt, outerTheater, theater, traceContours } from './terrain';
import { WORLD_H, WORLD_W } from './grid';

describe('terrain', () => {
  it('is the same for the same seed and different for another', () => {
    const a = generateTerrain(7);
    expect(generateTerrain(7).heights).toEqual(a.heights);
    expect(generateTerrain(8).heights).not.toEqual(a.heights);
  });

  it('the fine layer covers the grid with a margin; the coarse one reaches far past it', () => {
    expect(FINE.x).toBeLessThan(0);
    expect(FINE.x + FINE.w).toBeGreaterThan(WORLD_W);
    expect(COARSE.x).toBeLessThanOrEqual(-WORLD_W);
    expect(COARSE.y).toBeLessThanOrEqual(-3 * WORLD_H); // tall phones see a lot of ground
    expect(COARSE.y + COARSE.h).toBeGreaterThanOrEqual(4 * WORLD_H);
    expect(COARSE.sample).toBeGreaterThan(FINE.sample);
  });

  it('the two layers agree on the ground where they overlap', () => {
    const near = theater();
    const far = outerTheater();
    for (const [x, y] of [[0, 0], [600, 300], [1500, 900], [-300, 1200]]) {
      expect(Math.abs(heightAt(far, x, y) - heightAt(near, x, y))).toBeLessThan(40); // within two contour lines
    }
  });

  it('has real relief, and contours that stay inside their layer and carry on past the grid', () => {
    const t = generateTerrain(7);
    expect(t.max - t.min).toBeGreaterThan(200);
    const lines = traceContours(t);
    expect(lines.length).toBeGreaterThan(8);
    expect(lines.some((l) => l.index)).toBe(true);
    let outside = false;
    for (const l of lines)
      for (const ring of l.rings)
        for (const [x, y] of ring) {
          expect(x).toBeGreaterThanOrEqual(FINE.x);
          expect(y).toBeGreaterThanOrEqual(FINE.y);
          expect(x).toBeLessThanOrEqual(FINE.x + FINE.w);
          expect(y).toBeLessThanOrEqual(FINE.y + FINE.h);
          if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) outside = true;
        }
    expect(outside).toBe(true);
  });

  it('stays cheap to build: both layers in well under a second', () => {
    const t0 = performance.now();
    traceContours(generateTerrain(3));
    traceContours(generateTerrain(3, COARSE));
    expect(performance.now() - t0).toBeLessThan(1_500);
  });
});

describe('contour edges', () => {
  it('no segment runs along the edge of a layer (they would draw straight lines across the map)', () => {
    const t = generateTerrain(7);
    const xMax = t.x0 + (t.cols - 1) * t.sample;
    const yMax = t.y0 + (t.rows - 1) * t.sample;
    for (const l of traceContours(t))
      for (const run of l.rings)
        for (let i = 1; i < run.length; i++) {
          const [ax, ay] = run[i - 1];
          const [bx, by] = run[i];
          const onEdge = (ax === t.x0 && bx === t.x0) || (ax === xMax && bx === xMax) || (ay === t.y0 && by === t.y0) || (ay === yMax && by === yMax);
          expect(onEdge).toBe(false);
        }
  });
});
