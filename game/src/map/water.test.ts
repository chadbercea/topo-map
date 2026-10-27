import { describe, expect, it } from 'vitest';
import { generateTerrain, heightAt } from './terrain';
import { generateWater, wetAt } from './water';
import { findPath, legPath, theaterWater } from './paths';
import { squareAt, squareCenter } from './grid';

describe('water (ILI-1191)', () => {
  const t = generateTerrain();
  const w = generateWater(t);

  it('is the same map every time', () => {
    expect(generateWater(t).lines).toEqual(w.lines);
  });

  it('has streams and rivers crossing the AO', () => {
    const inside = w.lines.filter((l) => l.pts.some(([x, y]) => x >= 0 && y >= 0 && x <= 1600 && y <= 1000));
    expect(inside.length).toBeGreaterThan(8);
    expect(w.wet.some((v) => v === 2)).toBe(true);
  });

  it('runs downhill (a channel that starts in a hollow climbs out to its spill point)', () => {
    const down = w.lines.filter((l) => heightAt(t, l.pts.at(-1)![0], l.pts.at(-1)![1]) <= heightAt(t, l.pts[0][0], l.pts[0][1]));
    expect(down.length / w.lines.length).toBeGreaterThan(0.7);
  });
});

describe('paths over the ground (ILI-1191)', () => {
  it('reaches the square, without leaving the two squares of the leg', () => {
    const pts = findPath(squareCenter('G5')!, 'F4', ['G5']);
    expect(pts.at(-1)).toEqual(squareCenter('F4'));
    for (const p of pts) expect(['G5', 'F4']).toContain(squareAt(p.x, p.y));
  });

  it('is not just a straight line, and the drawn leg matches the walked one', () => {
    const leg = legPath('G5', 'F4');
    const a = leg[0];
    const b = leg.at(-1)!;
    const off = Math.max(...leg.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y)));
    expect(off).toBeGreaterThan(5);
    expect(legPath('G5', 'F4')).toBe(leg); // cached
  });

  it('keeps out of rivers where it can', () => {
    const water = theaterWater();
    const route = ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'];
    let wet = 0;
    let all = 0;
    for (let i = 1; i < route.length; i++)
      for (const p of legPath(route[i - 1], route[i])) {
        all++;
        if (wetAt(water, p.x, p.y) === 2) wet++;
      }
    expect(wet / all).toBeLessThan(0.1);
  });
});
