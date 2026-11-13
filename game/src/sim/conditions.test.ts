import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import { ground, imageryOk, terrainReading, weather } from './conditions';
import { blockers } from './progress';

describe('header readouts (ILI-1187)', () => {
  it('the weather clears through the morning, and imagery could be blinded by cloud later', () => {
    const dawn = weather(initialState());
    const late = weather({ ...initialState(), elapsedMs: 10 * 60_000 }); // 4 h of game time
    expect(dawn).toMatchObject({ sky: 'High cloud', light: 'Night' });
    expect(late.sky).toBe('Clear');
    expect(late.visibilityKm).toBeGreaterThan(dawn.visibilityKm);
    expect(imageryOk(dawn)).toBe(true);
    expect(imageryOk({ ...dawn, cloudPct: 95 })).toBe(false);
  });

  it('describes the ground of a square: height, slope, what is on it, what HQ has seen', () => {
    const g = ground(initialState(), 'E2')!;
    expect(g.highM).toBeGreaterThan(g.lowM);
    expect(g.features).toContain('town');
    expect(g.imagery).toBe('no coverage');
    expect(ground(initialState(), 'G5')!.imagery).toBe('imaged earlier'); // the insertion point
  });

  it("ORION-3's terrain reading: height, range, grade and the way the ground faces (ILI-1504)", () => {
    const t = terrainReading('E2')!;
    const g = ground(initialState(), 'E2')!;
    expect(t.centreM).toBeGreaterThanOrEqual(t.lowM);
    expect(t.centreM).toBeLessThanOrEqual(t.highM);
    expect(Math.abs(t.lowM - g.lowM)).toBeLessThanOrEqual(5); // the same elevation data as the map
    expect(t.gradePct).toBeGreaterThanOrEqual(0);
    expect(t.degrees).toBeLessThanOrEqual(t.gradePct); // a grade in % is always the bigger number
    expect(terrainReading('Z9')).toBeNull();
    // Every square reads, and a sloped one faces a compass point.
    for (const sq of ['A1', 'C3', 'G5', 'H1']) {
      const r = terrainReading(sq)!;
      if (r.gradePct >= 2) expect(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).toContain(r.aspect);
    }
  });

  it('blockers: what stands in the way', () => {
    const s = initialState();
    expect(blockers(s).map((b) => b.text)).toContain('No coverage ahead at F4');
    const hurt = { ...s, alerted: true, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 0 ? { ...o, health: 0 } : o)) } };
    expect(blockers(hurt).map((b) => b.text)).toEqual(expect.arrayContaining(['1 down', 'Enemy alerted to the PMC']));
  });
});
