import { describe, expect, it } from 'vitest';
import { PATROL_MOVES_MS } from './missions/blackBox';
import { nextUp, phasePips } from './progress';
import { initialState } from './state';
import { run, walking } from './testkit';

describe('mission progression', () => {
  it('pips walk A, B, C as the phase moves on', () => {
    const s = initialState();
    expect(phasePips(s).map((p) => p.state)).toEqual(['current', 'todo', 'todo']);
    const at = { ...s, mission: { ...s.mission, phase: 'objective' as const, recoverUntilMs: s.elapsedMs + 20_000 } };
    expect(phasePips(at).map((p) => p.state)).toEqual(['done', 'current', 'todo']);
    expect(phasePips(at)[1].detail).toBe('recovering · 8 min');
    expect(phasePips({ ...s, mission: { ...s.mission, phase: 'complete' } }).every((p) => p.state === 'done')).toBe(true);
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
