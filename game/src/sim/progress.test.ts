import { describe, expect, it } from 'vitest';
import { PATROL_MOVES_MS } from './missions/blackBox';
import { nextUp, race } from './progress';
import { initialState } from './state';
import { run, walking } from './testkit';

describe('mission progression', () => {
  it("the race: ALPHA's walk fills from A to C on one scale, B marked between", () => {
    const s = initialState();
    const start = race(s);
    expect(start.walked).toBe(0);
    expect(start.marks.map((m) => m.key)).toEqual(['A', 'B', 'C']);
    expect(start.marks[1].at).toBeGreaterThan(0);
    expect(start.marks[1].at).toBeLessThan(1);
    const early = race(run(walking(), 30_000));
    expect(early.walked).toBeGreaterThan(0);
    const later = race(run(walking(), 120_000));
    expect(later.walked).toBeGreaterThan(early.walked);
    expect(later.walked).toBeLessThan(1);
  });

  it('behind when the walk left needs more than the time left', () => {
    const s = walking();
    expect(race(s).behind).toBe(false);
    const late = { ...s, timer: { ...s.timer, remainingMs: race(s).needMs - 1 } };
    expect(race(late).behind).toBe(true);
  });

  it('a decision waiting stays on the call card; Next keeps pointing at the objective', () => {
    const s = run(initialState(), 500); // ALPHA holds short of F4
    expect(nextUp(s)).toEqual({ tone: 'objective', text: 'Reach the crash site at D3' });
  });

  it('the patrol shows an ETA only once someone has found it', () => {
    const s = walking();
    expect(nextUp(s).tone).toBe('objective');
    const contacts = initialState().contacts.map((c) => (c.id === 'patrol' ? { ...c, status: 'revealed' as const } : c));
    expect(nextUp({ ...s, contacts })).toEqual({ tone: 'threat', text: 'Patrol moves on D3', atMs: PATROL_MOVES_MS });
  });

});
