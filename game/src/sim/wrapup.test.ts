import { describe, expect, it } from 'vitest';
import { CASUALTY_PENALTY, CONTRACT, outcomeOf, wrapUp } from './wrapup';
import { initialState, MISSION_MS, type GameState } from './state';
import { run, walking } from './testkit';

const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 600_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const finished = () => until(walking(), (x) => x.phase === 'ended');

describe('wrap-up', () => {
  it('a clean exfil with the black box is a win, paid the contract', () => {
    const w = wrapUp(finished());
    expect(w.outcome).toBe('win');
    expect(w.objectives.every((o) => o.done)).toBe(true);
    expect(w.payout[0]).toEqual({ label: 'Contract', amount: CONTRACT });
    expect(w.budget).toBe(CONTRACT);
  });

  it('casualties complete the mission but are not a win, and cost money', () => {
    const s0 = finished();
    const s = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i === 0 ? { ...o, health: 0 } : o)) } };
    const w = wrapUp(s);
    expect(w.outcome).toBe('casualties');
    expect(w.objectives.find((o) => o.label === 'No casualties')?.done).toBe(false);
    expect(w.budget).toBe(CONTRACT - CASUALTY_PENALTY);
  });

  it('time running out before exfil is a failure: no contract', () => {
    const s = run({ ...initialState(), timer: { remainingMs: 1_000 } }, 1_100);
    expect(s.phase).toBe('ended');
    const w = wrapUp(s);
    expect(w.outcome).toBe('failed');
    expect(w.reason).toBe('Time ran out before exfil.');
    expect(w.payout[0].amount).toBe(0);
  });

  it('losing the whole team ends the mission as a failure', () => {
    const s0 = walking();
    const s = run({ ...s0, team: { ...s0.team, operators: s0.team.operators.map((o) => ({ ...o, health: 0 })) } }, 100);
    expect(s.phase).toBe('ended');
    expect(outcomeOf(s)).toBe('failed');
    expect(wrapUp(s).reason).toBe('The team was lost.');
  });

  it('field earnings carry into the budget for the next mission', () => {
    const s0 = finished();
    const w = wrapUp({ ...s0, resources: { ...s0.resources, budget: 4_500 } });
    expect(w.budget).toBe(CONTRACT + 4_500);
  });

  it('the six-minute clock is the limit', () => {
    expect(MISSION_MS).toBe(360_000);
  });
});
