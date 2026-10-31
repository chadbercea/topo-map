import { describe, expect, it } from 'vitest';
import { weaponBlocked } from './ordnance';
import { BOLT_MS, FIRST_MS, LEAVE_MS, RUN_MS, sniperGone } from './sniper';
import { CASH_PER_STRIKE_KILL } from './sites';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// Six fighters in E3 that ORION-3 has just photographed.
const e3 = (units = [0, 3, 5, 6, 9, 10]): GameState => {
  const s = { ...walking(), elapsedMs: 100_000 };
  return {
    ...s,
    contacts: [{ id: 't', square: 'E3', label: 'a checkpoint', strength: 1, status: 'revealed', observed: false, units, total: units.length }],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'A checkpoint', atMs: 0, status: 'seen' }],
    imagery: { E3: { square: 'E3', atMs: s.elapsedMs, mode: 'photo', live: false, seen: [{ contactId: 't', x: 800, y: 400, units, to: null, awareness: 'unaware' }] } },
  };
};

describe('sniper (ILI-1253)', () => {
  it('shoots on its own for five seconds, a bolt-action round at a time: five shots, five down', () => {
    const store = createStore(e3());
    store.fire('t', 'sniper');
    const r = store.get().sniper!;
    expect(store.get().minigame).toBeNull(); // nothing to aim
    expect(r.shots).toHaveLength(5); // six fighters, but only time for five
    expect(r.shots.map((x) => x.atMs - r.startedMs)).toEqual([0, 1, 2, 3, 4].map((i) => FIRST_MS + i * BOLT_MS));
    let s = run(store.get(), FIRST_MS + 50);
    expect(s.contacts[0].units).toHaveLength(5);
    s = run(s, RUN_MS);
    expect(s.contacts[0].units).toHaveLength(1);
    expect(s.sniper!.done).toBe(true);
    expect(s.resources.ledger.field).toBe(5 * CASH_PER_STRIKE_KILL);
    expect(s.comms.messages.at(-1)).toMatchObject({ from: 'OVERWATCH', text: `E3: 5 down, 1 still in there. +$${(5 * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` });
    expect(sniperGone(run(s, LEAVE_MS).sniper!, s.elapsedMs + LEAVE_MS)).toBe(true);
  });

  it('the crosshairs take short hops: each shot is the nearest one left', () => {
    const store = createStore(e3());
    store.fire('t', 'sniper');
    const shots = store.get().sniper!.shots;
    for (let i = 1; i < shots.length - 1; i++) {
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
      for (const later of shots.slice(i + 1)) expect(d(shots[i - 1], shots[i])).toBeLessThanOrEqual(d(shots[i - 1], later));
    }
  });

  it('fewer fighters than time: it takes them all, and the target is cleared', () => {
    const store = createStore(e3([5, 6]));
    store.fire('t', 'sniper');
    const s = run(store.get(), RUN_MS + 200);
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.events.find((e) => e.id === 'contact-t')?.status).toBe('resolved');
    expect(s.comms.messages.at(-1)?.text).toMatch(/^E3: all targets down\. 2 down\./);
  });

  it('a fighter that has moved since the look is a miss', () => {
    const s0 = e3([5, 6]);
    const store = createStore({ ...s0, contacts: [{ ...s0.contacts[0], units: [5, 7] }] }); // 6 moved to 7
    store.fire('t', 'sniper');
    expect(store.get().sniper!.shots.map((x) => x.hit)).toEqual(expect.arrayContaining([true, false]));
  });

  it('a fresh sniper every call: seven rounds again, and no wait', () => {
    const store = createStore(e3([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    store.fire('t', 'sniper');
    store.set(run(store.get(), RUN_MS + 200));
    expect(weaponBlocked(store.get(), 'sniper')).toBeNull();
    store.fire('t', 'sniper');
    expect(store.get().sniper).toMatchObject({ rounds: 7, fired: 0 });
    expect(store.get().sniper!.shots).toHaveLength(5);
  });
});
