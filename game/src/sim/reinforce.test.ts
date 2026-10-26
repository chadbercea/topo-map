import { describe, expect, it } from 'vitest';
import { REINFORCE_COST, REINFORCE_FLIGHT_MS } from './support';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';
import { wrapUp } from './wrapup';

// Two operators down after a bad fight, money in the bank.
const mauled = (budget = 10_000): GameState => {
  const s = walking();
  return {
    ...s,
    resources: { ...s.resources, budget },
    team: { ...s.team, operators: s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o)) },
  };
};
const call = (s: GameState) => s.comms.messages.find((m) => m.node === 'ineffective' && m.status === 'new');

describe('reinforcements', () => {
  it('two down: the team is combat ineffective, holds, and asks for help', () => {
    const s = run(mauled(), 200);
    expect(call(s)?.text).toBe("We're combat ineffective, 2 down. We need reinforcements.");
    expect(s.team.holdFor).toBe(call(s)?.id);
  });

  it('reinforcements cost budget, fly in, and replace the downed with fresh contractors', () => {
    const store = createStore(run(mauled(), 200));
    store.respond(call(store.get())!.id, 'reinforce');
    expect(store.get().resources.budget).toBe(10_000 - REINFORCE_COST);
    store.set(run(store.get(), REINFORCE_FLIGHT_MS + 200));
    const ops = store.get().team.operators;
    expect(ops.every((o) => o.health > 0)).toBe(true);
    expect(ops.slice(0, 2).map((o) => o.name)).not.toEqual(['Reyes', 'Okafor']); // new people
    expect(ops.slice(0, 2).map((o) => o.role)).toEqual(['Squad lead', 'Gunner']); // same jobs
    expect(store.get().comms.messages.some((m) => m.from === 'DUSTOFF-2' && /back to strength/.test(m.text))).toBe(true);
  });

  it('the dead still count: a replaced casualty is a casualty in the wrap-up', () => {
    const store = createStore(run(mauled(), 200));
    store.respond(call(store.get())!.id, 'reinforce');
    store.set(run(store.get(), REINFORCE_FLIGHT_MS + 200));
    const s = store.get();
    const w = wrapUp({ ...s, mission: { ...s.mission, phase: 'complete', blackBox: true } });
    expect(w.outcome).toBe('casualties');
    expect(w.reason).toMatch(/2 operators down/);
  });

  it('push on: the team carries on short-handed', () => {
    const store = createStore(run(mauled(), 200));
    store.respond(call(store.get())!.id, 'push');
    expect(store.get().team.holdFor).toBeNull();
    const before = store.get().team.position;
    expect(run(store.get(), 2_000).team.position).not.toEqual(before);
  });
});
