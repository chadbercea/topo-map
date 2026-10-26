import { describe, expect, it } from 'vitest';
import { HOLD_TIMEOUT_MS } from './comms';
import { PATROL_MOVES_MS } from './missions/blackBox';
import { callDeadline, nextUp, phasePips } from './progress';
import { initialState } from './state';
import { step } from './systems';
import { run, walking } from './testkit';

describe('mission progression', () => {
  it('pips walk A, B, C as the phase moves on', () => {
    const s = initialState();
    expect(phasePips(s).map((p) => p.state)).toEqual(['current', 'todo', 'todo']);
    const at = { ...s, mission: { ...s.mission, phase: 'objective' as const, recoverUntilMs: s.elapsedMs + 12_000 } };
    expect(phasePips(at).map((p) => p.state)).toEqual(['done', 'current', 'todo']);
    expect(phasePips(at)[1].detail).toBe('recovering 12s');
    expect(phasePips({ ...s, mission: { ...s.mission, phase: 'complete' } }).every((p) => p.state === 'done')).toBe(true);
  });

  it('a decision waiting comes first, with the hold timing out', () => {
    const s = run(initialState(), 500); // ALPHA holds short of F4
    const hold = s.comms.messages.find((m) => m.id === s.team.holdFor)!;
    expect(nextUp(s)).toMatchObject({ tone: 'call', text: 'ALPHA needs a decision', atMs: hold.atMs + HOLD_TIMEOUT_MS });
    expect(callDeadline(s, hold)).toBe(hold.atMs + HOLD_TIMEOUT_MS);
  });

  it('the patrol shows an ETA only once someone has found it', () => {
    const s = walking();
    expect(nextUp(s).tone).toBe('objective');
    const contacts = initialState().contacts.map((c) => (c.id === 'patrol' ? { ...c, status: 'revealed' as const } : c));
    expect(nextUp({ ...s, contacts })).toEqual({ tone: 'threat', text: 'Patrol moves on D3', atMs: PATROL_MOVES_MS });
  });

  it('the side job adds a pip and its deadline', () => {
    const s = step({ ...walking(), elapsedMs: 89_900 }, 100);
    const job = { ...s.sideJob!, status: 'active' as const, deadlineMs: s.elapsedMs + 30_000 };
    const active = { ...s, sideJob: job, comms: { ...s.comms, messages: [] } };
    expect(phasePips(active).at(-1)).toMatchObject({ key: '$', state: 'current', detail: '30s' });
    expect(nextUp(active)).toMatchObject({ tone: 'job', atMs: job.deadlineMs });
  });
});
