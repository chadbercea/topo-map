import { describe, expect, it } from 'vitest';
import { ammoLevel, LOW, RESUPPLY_COST, RESUPPLY_FLIGHT_MS } from './support';
import { LOADOUT } from './team';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// ALPHA after a long fight: a fifth of its ammo left, and money in the bank.
const lowOnAmmo = (budget = 10_000): GameState => {
  const s = walking();
  return {
    ...s,
    resources: { ...s.resources, budget },
    team: { ...s.team, operators: s.team.operators.map((o) => ({ ...o, ammo: Math.round(LOADOUT[o.role].ammo * 0.2) })) },
  };
};
const lowCall = (s: GameState) => s.comms.messages.find((m) => m.node === 'low-supplies');

describe('helicopter resupply', () => {
  it('the team calls in when it runs low', () => {
    const s = run(lowOnAmmo(), 200);
    expect(ammoLevel(s)).toBeLessThan(LOW);
    expect(lowCall(s)?.text).toBe('Running low on ammo. Can you get us a resupply?');
    expect(s.team.holdFor).toBeNull(); // they keep moving while they ask
  });

  it('a resupply bird costs budget, flies in, and refills everyone standing', () => {
    const store = createStore(run(lowOnAmmo(), 200));
    store.respond(lowCall(store.get())!.id, 'resupply');
    expect(store.get().resources.budget).toBe(10_000 - RESUPPLY_COST);
    expect(store.get().inbound).toHaveLength(1);
    store.set(run(store.get(), RESUPPLY_FLIGHT_MS - 500));
    expect(ammoLevel(store.get())).toBeLessThan(LOW);
    store.set(run(store.get(), 1_000));
    expect(ammoLevel(store.get())).toBe(1);
    expect(store.get().comms.messages.some((m) => m.from === 'DUSTOFF-2' && /Full reload/.test(m.text))).toBe(true);
  });

  it('greyed out without the money; asks again only after a refill', () => {
    const s = run(lowOnAmmo(0), 200);
    const call = lowCall(s)!;
    expect(call.responses?.find((r) => r.id === 'resupply')).toBeTruthy();
    expect(run(s, 5_000).comms.messages.filter((m) => m.node === 'low-supplies')).toHaveLength(1);
  });

  it('only one bird at a time', () => {
    const store = createStore(run(lowOnAmmo(), 200));
    store.sendResupply();
    store.sendResupply();
    expect(store.get().inbound).toHaveLength(1);
    expect(store.get().resources.budget).toBe(10_000 - RESUPPLY_COST);
  });
});
