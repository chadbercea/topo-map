import { describe, expect, it } from 'vitest';
import { generateCity } from './city';
import { WORLD_H, WORLD_W } from './grid';
import { hillshade } from './relief';
import { generateTerrain } from './terrain';

describe('city overlay', () => {
  it('is the same every time for a seed', () => {
    expect(generateCity(11)).toEqual(generateCity(11));
  });

  it('has highways and streets, and no buildings', () => {
    const c = generateCity();
    expect(c.roads.length).toBe(2);
    expect(c.streets.length).toBeGreaterThan(20);
    expect(c).not.toHaveProperty('blocks');
    for (const road of c.roads)
      for (const [x, y] of road) {
        expect(x).toBeGreaterThanOrEqual(-40);
        expect(x).toBeLessThanOrEqual(WORLD_W + 40);
        expect(y).toBeGreaterThanOrEqual(-40);
        expect(y).toBeLessThanOrEqual(WORLD_H + 40);
      }
  });
});

describe('relief', () => {
  it('shades every sample opaque, with light and dark faces', () => {
    const t = generateTerrain();
    const px = hillshade(t);
    expect(px.length).toBe(t.cols * t.rows * 4);
    const greens = [];
    for (let k = 0; k < px.length; k += 4) {
      expect(px[k + 3]).toBe(255);
      greens.push(px[k + 1]);
    }
    expect(Math.max(...greens) - Math.min(...greens)).toBeGreaterThan(40);
  });
});
