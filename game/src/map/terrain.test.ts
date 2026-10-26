import { describe, expect, it } from 'vitest';
import { generateTerrain, traceContours } from './terrain';
import { WORLD_H, WORLD_W } from './grid';

describe('terrain', () => {
  it('is the same for the same seed and different for another', () => {
    const a = generateTerrain(7);
    expect(generateTerrain(7).heights).toEqual(a.heights);
    expect(generateTerrain(8).heights).not.toEqual(a.heights);
  });

  it('has real relief, and contours that stay inside the world', () => {
    const t = generateTerrain(7);
    expect(t.max - t.min).toBeGreaterThan(200);
    const lines = traceContours(t);
    expect(lines.length).toBeGreaterThan(8);
    expect(lines.some((l) => l.index)).toBe(true);
    for (const l of lines)
      for (const ring of l.rings)
        for (const [x, y] of ring) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(WORLD_W);
          expect(y).toBeLessThanOrEqual(WORLD_H);
        }
  });
});
