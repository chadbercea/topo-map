import { describe, expect, it } from 'vitest';
import { nextContract } from './campaign';
import { CONTRACTS, initialState } from './state';
import { createStore } from './store';
import { wrapUp } from './wrapup';
import { run, walking } from './testkit';

// The campaign (ILI-1566): three contracts, the balance and the team carried from one to the next.
const finished = () => {
  let s = walking();
  for (let t = 0; t < 600_000 && s.phase !== 'ended'; t += 100) s = run(s, 100);
  return s;
};

describe('campaign', () => {
  it('a mission opens as contract 1 of 3, with the full team', () => {
    const s = initialState();
    expect(s.campaign).toEqual({ contract: 1, roles: null });
    expect(CONTRACTS).toBe(3);
    expect(s.team.operators).toHaveLength(5);
  });

  it('the next contract: a new map, the closing balance, and only who came home', () => {
    const done = finished();
    expect(done.mission.phase).toBe('complete');
    const lost = { ...done, team: { ...done.team, operators: done.team.operators.map((o, i) => (i === 1 ? { ...o, health: 0 } : o)) } };
    const s = nextContract(lost);
    expect(s.campaign.contract).toBe(2);
    expect(s.seed).toBe(done.seed + 1);
    expect(s.resources.ledger.opening).toBe(wrapUp(lost).budget);
    expect(s.team.operators.map((o) => o.role)).toEqual(done.team.operators.filter((_, i) => i !== 1).map((o) => o.role)); // the dead stay dead
    expect(s.team.operators.every((o) => o.health === 100)).toBe(true); // the living, healed
  });

  it('retrying a failed contract keeps it as it opened: same contract, same team, same map', () => {
    const store = createStore(initialState(undefined, undefined, 5_000_000, [], [], 99, { contract: 2, roles: ['Squad lead', 'Medic', 'Gunner'] }));
    store.set(run(store.get(), 30_000));
    store.retryContract();
    const s = store.get();
    expect(s.campaign).toEqual({ contract: 2, roles: ['Squad lead', 'Medic', 'Gunner'] });
    expect(s.team.operators.map((o) => o.role).sort()).toEqual(['Gunner', 'Medic', 'Squad lead']);
    expect(s.seed).toBe(99);
    expect(s.elapsedMs).toBe(0);
  });
});
