import { describe, expect, it } from 'vitest';
import { initialState, standby } from './state';
import { ground, groundInView, imageryOk, weather } from './conditions';
import { blockers, winChecks } from './progress';

describe('header readouts (ILI-1187)', () => {
  it('the weather clears through the morning, and imagery could be blinded by cloud later', () => {
    const dawn = weather(standby());
    const late = weather({ ...standby(), theaterMs: 6 * 60_000 }); // 4 h of game time
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
    expect(g.imagery).toBe('no imagery');
    expect(ground(initialState(), 'G5')!.imagery).toBe('known ground'); // the insertion point
  });

  it('looks at the selected square, else where ALPHA is, and nothing before the link', () => {
    const s = initialState();
    expect(groundInView(s)!.square).toBe('G5');
    expect(groundInView({ ...s, map: { ...s.map, selected: 'C2' } })!.square).toBe('C2');
    expect(groundInView(standby())).toBeNull();
  });

  it('blockers: no link before the SITREP, then what stands in the way', () => {
    expect(blockers(standby())).toEqual([{ tone: 'decision', text: 'No team linked' }]);
    const s = initialState();
    expect(blockers(s).map((b) => b.text)).toContain('No imagery ahead at F4');
    const hurt = { ...s, alerted: true, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 0 ? { ...o, health: 0 } : o)) } };
    expect(blockers(hurt).map((b) => b.text)).toEqual(expect.arrayContaining(['1 down', 'Enemy alerted to the PMC']));
  });

  it('win conditions tick off as the mission goes', () => {
    const s = initialState();
    expect(winChecks(s).map((w) => w.done)).toEqual([false, true, false]);
    expect(winChecks({ ...s, mission: { ...s.mission, blackBox: true, phase: 'complete' } }).every((w) => w.done)).toBe(true);
  });
});
