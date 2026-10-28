import { describe, expect, it } from 'vitest';
import { ammoLevel, LOW, RESUPPLY_COST, RESUPPLY_FLIGHT_MS } from './support';
import { LOADOUT } from './team';
import type { GameState } from './state';
import { createStore } from './store';
import { answer, run, walking } from './testkit';
import { wrapUp } from './wrapup';

// ALPHA after a long fight: a fifth of its ammo left, and money in the bank.
const lowOnAmmo = (budget = 10_000): GameState => {
  const s = walking();
  return {
    ...s,
    resources: { ...s.resources, budget },
    team: { ...s.team, operators: s.team.operators.map((o) => ({ ...o, ammo: Math.round(LOADOUT[o.role].ammo * 0.2) })) },
  };
};
const lowCall = (s: GameState) => s.comms.messages.find((m) => m.node === 'resupply');

describe('resupply', () => {
  it('the team calls in when it runs low', () => {
    const s = run(lowOnAmmo(), 200);
    expect(ammoLevel(s)).toBeLessThan(LOW);
    expect(lowCall(s)?.text).toBe('Running low on ammo. We need a resupply bird.');
    expect(s.team.holdFor).toBeNull(); // they keep moving while they ask
  });

  it('a resupply bird costs budget, flies in, and refills everyone standing', () => {
    const store = createStore(run(lowOnAmmo(), 200));
    answer(store, lowCall(store.get())!.id, 'resupply');
    expect(store.get().resources.budget).toBe(10_000 - RESUPPLY_COST);
    expect(store.get().inbound).toHaveLength(1);
    store.set(run(store.get(), RESUPPLY_FLIGHT_MS - 500));
    expect(ammoLevel(store.get())).toBeLessThan(LOW);
    store.set(run(store.get(), 1_000));
    expect(ammoLevel(store.get())).toBe(1);
    expect(store.get().comms.messages.some((m) => m.from === 'DUSTOFF-2' && /Full reload/.test(m.text))).toBe(true);
  });

  it('asks once per shortage, even after HQ says to make it last', () => {
    const store = createStore(run(lowOnAmmo(0), 200));
    answer(store, lowCall(store.get())!.id, 'push');
    expect(run(store.get(), 5_000).comms.messages.filter((m) => m.node === 'resupply')).toHaveLength(1);
  });

  it('only one bird at a time', () => {
    const store = createStore(run(lowOnAmmo(), 200));
    store.sendResupply();
    store.sendResupply();
    expect(store.get().inbound).toHaveLength(1);
    expect(store.get().resources.budget).toBe(10_000 - RESUPPLY_COST);
  });
});

// Two operators down after a bad fight, money in the bank.
const mauled = (budget = 10_000): GameState => {
  const s = walking();
  return {
    ...s,
    resources: { ...s.resources, budget },
    team: { ...s.team, operators: s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o)) },
  };
};
const ineffective = (s: GameState) => s.comms.messages.find((m) => m.node === 'resupply' && m.status === 'new');

describe('combat ineffective', () => {
  it('two down: the team holds and asks for the same resupply bird', () => {
    const s = run(mauled(), 200);
    expect(ineffective(s)?.text).toBe('Combat ineffective, 2 down. We need a resupply bird.');
    expect(s.team.holdFor).toBe(ineffective(s)?.id);
  });

  it('the bird brings replacements for the downed, and the dead still count in the wrap-up', () => {
    const store = createStore(run(mauled(), 200));
    answer(store, ineffective(store.get())!.id, 'resupply');
    expect(store.get().resources.budget).toBe(10_000 - RESUPPLY_COST);
    store.set(run(store.get(), RESUPPLY_FLIGHT_MS + 200));
    const ops = store.get().team.operators;
    expect(ops.every((o) => o.health > 0)).toBe(true);
    expect(ops.slice(0, 2).map((o) => o.name)).not.toEqual(['Reyes', 'Okafor']); // new people
    expect(ops.slice(0, 2).map((o) => o.role)).toEqual(['Squad lead', 'Gunner']); // same jobs
    expect(store.get().comms.messages.some((m) => m.from === 'DUSTOFF-2' && /back to strength/.test(m.text))).toBe(true);
    const s = store.get();
    expect(wrapUp({ ...s, mission: { ...s.mission, phase: 'complete', blackBox: true } }).reason).toMatch(/2 operators down/);
  });

  it('push on: the team carries on short-handed', () => {
    const store = createStore(run(mauled(), 200));
    answer(store, ineffective(store.get())!.id, 'push');
    expect(store.get().team.holdFor).toBeNull();
    const before = store.get().team.position;
    expect(run(store.get(), 2_000).team.position).not.toEqual(before);
  });
});
