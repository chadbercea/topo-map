import { describe, expect, it } from 'vitest';
import { HOP_MS, match, RECEIVE_MS, TRANSMISSION_MS, transcript } from './signal';
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

  it('intercepting opens the transmission; the match reads 100% on their frequency', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    const g = store.get().minigame!.signal!;
    expect(store.get().minigame).toMatchObject({ kind: 'signal', status: 'active', durationMs: TRANSMISSION_MS });
    store.tune(g.target);
    expect(match(store.get().minigame!.signal!)).toBe(1);
    store.tune(g.target + 3);
    expect(match(store.get().minigame!.signal!)).toBeCloseTo(0.5);
  });

  it('words come through only while the lines match, and never go backwards', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    store.tune(store.get().minigame!.signal!.target + 4); // off
    store.set(run(store.get(), 2_000));
    expect(store.get().minigame!.signal!.progress).toBe(0);
    store.tune(store.get().minigame!.signal!.target);
    store.set(run(store.get(), 1_000));
    const got = store.get().minigame!.signal!.progress;
    expect(got).toBeCloseTo(1_000 / RECEIVE_MS, 2);
    expect(transcript(store.get().minigame!.signal!).length).toBeGreaterThan(0);
  });

  it('they hop every few seconds, so the line has to follow', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    const first = store.get().minigame!.signal!.target;
    store.set(run(store.get(), HOP_MS + 100));
    expect(store.get().minigame!.signal!.target).not.toBe(first);
  });

  // Follow them perfectly: re-tune onto their frequency every tick.
  const follow = (ms: number) => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    for (let t = 0; t < ms && store.get().minigame?.status === 'active'; t += 100) {
      store.tune(store.get().minigame!.signal!.target);
      store.tick(100);
    }
    return store;
  };

  it('following them all the way decodes their plan: patrol marked, route known', () => {
    const s: GameState = follow(TRANSMISSION_MS).get();
    expect(s.minigame).toBeNull();
    const patrol = s.contacts.find((c) => c.id === 'patrol')!;
    expect(patrol).toMatchObject({ status: 'revealed', planKnown: true, planTo: 'D3' });
    expect(s.events.find((e) => e.id === 'traffic-c2')?.status).toBe('resolved');
    expect(s.comms.messages.some((m) => m.from === 'SIGINT' && m.text === 'Decoded: "PATROL AT C2 MOVING TO D3 FOR THE DRONE".')).toBe(true);
  });

  it('part of it gives where they are but not their plan; nothing gives nothing', () => {
    const store = atTraffic();
    store.intercept('traffic-c2');
    store.set({ ...store.get(), minigame: { ...store.get().minigame!, signal: { ...store.get().minigame!.signal!, progress: 0.5 } } });
    store.abortMiniGame();
    const patrol = store.get().contacts.find((c) => c.id === 'patrol')!;
    expect(store.get().minigame).toBeNull();
    expect(patrol.status).toBe('revealed');
    expect(patrol.planKnown).toBeFalsy();
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/they're at C2, but not what they plan/);

    const deaf = atTraffic();
    deaf.intercept('traffic-c2');
    deaf.abortMiniGame(); // nothing came through
    expect(deaf.get().minigame).toBeNull();
    expect(deaf.get().comms.messages.at(-1)?.text).toBe('Lost the signal.');
    expect(deaf.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
  });
});
