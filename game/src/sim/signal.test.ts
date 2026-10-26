import { describe, expect, it } from 'vitest';
import { cipherText, LOCK_HOLD_MS, LOCK_WITHIN, strength } from './signal';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run } from './testkit';

// At 0:50 enemy traffic comes up near C2, where the patrol is hiding.
const atTraffic = () => {
  const store = createStore({ ...run(initialState(), 50_000), comms: initialState().comms });
  return store;
};

describe('signal intercept', () => {
  it('enemy traffic comes up on the map and HQ flags it', () => {
    const s = run(initialState(), 50_000);
    expect(s.events.find((e) => e.kind === 'signal')).toMatchObject({ square: 'C2', status: 'new' });
    expect(s.comms.messages.find((m) => m.id === 'hq-traffic-c2')?.text).toMatch(/enemy radio traffic near C2/);
  });

  it('intercepting opens tuning; the meter peaks on the frequency', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    const g = store.get().minigame!.signal!;
    expect(store.get().minigame).toMatchObject({ kind: 'signal', status: 'active' });
    expect(g.phase).toBe('tune');
    store.tune(g.target);
    expect(strength(store.get().minigame!.signal!)).toBe(1);
    store.tune(g.target + 3);
    expect(strength(store.get().minigame!.signal!)).toBeCloseTo(0.5);
  });

  it('holding inside the band locks on; drifting out resets the lock', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    const target = store.get().minigame!.signal!.target;
    store.tune(target + LOCK_WITHIN);
    store.set(run(store.get(), LOCK_HOLD_MS - 300));
    store.tune(target + 2);
    store.set(run(store.get(), 200));
    expect(store.get().minigame!.signal!.lockMs).toBe(0);
    store.tune(target);
    store.set(run(store.get(), LOCK_HOLD_MS));
    expect(store.get().minigame!.signal!.phase).toBe('decode');
  });

  it('decoding: shift until it reads; the decode marks the patrol and feeds signals intel', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    store.tune(store.get().minigame!.signal!.target);
    store.set(run(store.get(), LOCK_HOLD_MS));
    const g = store.get().minigame!.signal!;
    expect(cipherText(g)).not.toBe(g.plain);
    for (let i = 0; i < g.shift; i++) store.shiftCipher(1);
    expect(cipherText(store.get().minigame!.signal!)).toBe('PATROL AT C2 HOLD POSITION');
    const signals = store.get().intel.projects.signals?.progress ?? 0;
    store.submitDecode();
    const s: GameState = store.get();
    expect(s.minigame!.status).toBe('won');
    expect(s.contacts.find((c) => c.id === 'patrol')?.status).toBe('revealed');
    expect(s.events.find((e) => e.id === 'contact-patrol')).toBeTruthy();
    expect(s.events.find((e) => e.id === 'traffic-c2')?.status).toBe('resolved');
    if (s.intel.projects.signals) expect(s.intel.projects.signals.progress).toBeGreaterThan(signals);
    expect(s.comms.messages.some((m) => m.from === 'SIGINT' && m.text === 'Decoded: "PATROL AT C2 HOLD POSITION".')).toBe(true);
  });

  it('a wrong decode costs time; running out loses', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    store.tune(store.get().minigame!.signal!.target);
    store.set(run(store.get(), LOCK_HOLD_MS));
    const before = store.get().minigame!.durationMs;
    store.submitDecode(); // guess 0 is never the shift (3-22)
    expect(store.get().minigame!.durationMs).toBe(before - 3_000);
    store.set(run(store.get(), 30_000));
    expect(store.get().minigame!.status).toBe('lost');
    expect(store.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
  });
});
