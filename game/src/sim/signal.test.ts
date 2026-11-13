import { promptQueue } from './prompts';
import { describe, expect, it } from 'vitest';
import { HOP_MS, match, RECEIVE_MS, TRANSMISSION_MS, transcript } from './signal';
import { initialState, type GameState } from './state';
import { lockedStore as createStore } from './testkit';
import { pulled, run, trafficId, untilTraffic } from './testkit';

// Enemy traffic comes up near C2, where the patrol is hiding: on the default seed it talks first,
// before a minute is up (ILI-1454). C2 is ground ORION-3 has scanned, as a scan's SIGINT report
// brings the traffic in (ILI-1359); scanned: false is traffic heard from ground it hasn't (ILI-1493).
const atTraffic = (scanned = true) => {
  const s0 = initialState();
  const s = scanned ? { ...s0, intel: { ...s0.intel, graded: ['C2'] } } : s0;
  const store = createStore({ ...untilTraffic(s), comms: s0.comms });
  return store;
};

describe('signal intercept', () => {
  it('enemy traffic comes up on the map as a tag, with no HQ call (ILI-1359)', () => {
    const s = untilTraffic(initialState());
    expect(s.events.find((e) => e.kind === 'signal')).toMatchObject({ square: 'C2', status: 'new' });
    expect(s.comms.messages.find((m) => m.id === `hq-${trafficId(s)}`)).toBeUndefined();
  });

  it('intercepting opens the transmission; the match reads 100% on their frequency', () => {
    const store = atTraffic();
    store.intercept(trafficId(store.get()));
    const g = store.get().minigame!.signal!;
    expect(store.get().minigame).toMatchObject({ kind: 'signal', status: 'active', durationMs: TRANSMISSION_MS });
    store.tune(g.target);
    expect(match(store.get().minigame!.signal!)).toBe(1);
    store.tune(g.target + 3);
    expect(match(store.get().minigame!.signal!)).toBeCloseTo(0.5);
  });

  it('words come through only while the lines match, and never go backwards', () => {
    const store = atTraffic();
    store.intercept(trafficId(store.get()));
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
    store.intercept(trafficId(store.get()));
    const first = store.get().minigame!.signal!.target;
    store.set(run(store.get(), HOP_MS + 100));
    expect(store.get().minigame!.signal!.target).not.toBe(first);
  });

  // Follow them perfectly: re-tune onto their frequency every tick.
  const follow = (ms: number) => {
    const store = atTraffic();
    store.intercept(trafficId(store.get()));
    for (let t = 0; t < ms && store.get().minigame?.status === 'active'; t += 100) {
      store.tune(store.get().minigame!.signal!.target);
      store.tick(100);
    }
    return store;
  };

  it('following them all the way decodes their plan: it goes on the shelf, and once ALPHA pulls it the route is known (ILI-1394, ILI-1499)', () => {
    const store = follow(TRANSMISSION_MS);
    const before = store.get();
    expect(before.minigame).toBeNull();
    expect(promptQueue(before).some((x) => (x.kind as string) === 'intel-ready')).toBe(false); // no send step: HQ can't push it
    const pkg = before.intel.pushes.find((p) => p.source === 'SIGINT')!;
    expect(pkg).toMatchObject({ square: 'C2', contactId: 'patrol' });
    expect(['posted', 'pulling']).toContain(pkg.state);
    expect(before.contacts.find((c) => c.id === 'patrol')!.planKnown).toBeFalsy(); // not until ALPHA pulls it
    const s: GameState = pulled(before);
    const patrol = s.contacts.find((c) => c.id === 'patrol')!;
    expect(patrol).toMatchObject({ status: 'revealed', planKnown: true, planTo: 'D3' });
    expect(s.events.find((e) => e.kind === 'signal')?.status).toBe('resolved');
    expect(s.comms.messages.some((m) => m.from === 'SIGINT' && m.text === 'Decoded: "PATROL AT C2 MOVING TO D3 FOR THE DRONE". Posted for ALPHA.')).toBe(true);
  });

  it('part of it gives where they are but not their plan; nothing gives nothing', () => {
    const store = atTraffic();
    store.intercept(trafficId(store.get()));
    store.set({ ...store.get(), minigame: { ...store.get().minigame!, signal: { ...store.get().minigame!.signal!, progress: 0.5 } } });
    store.abortMiniGame();
    const patrol = store.get().contacts.find((c) => c.id === 'patrol')!;
    expect(store.get().minigame).toBeNull();
    expect(patrol.status).toBe('revealed');
    expect(patrol.planKnown).toBeFalsy();
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/they're at C2, but not what they plan/);

    const deaf = atTraffic(false); // off unscanned ground: ORION-3 over a scanned C2 would see them itself (ILI-1493)
    deaf.intercept(trafficId(deaf.get()));
    deaf.abortMiniGame(); // nothing came through
    expect(deaf.get().minigame).toBeNull();
    expect(deaf.get().comms.messages.at(-1)?.text).toBe('Lost the signal.');
    expect(deaf.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
  });

  it('heard off ground ORION-3 hasn\u2019t scanned, it gives their words but never where they are (ILI-1493)', () => {
    const part = atTraffic(false);
    part.intercept(trafficId(part.get()));
    part.set({ ...part.get(), minigame: { ...part.get().minigame!, signal: { ...part.get().minigame!.signal!, progress: 0.5 } } });
    part.abortMiniGame();
    expect(part.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
    expect(part.get().events.some((e) => e.id === 'contact-patrol')).toBe(false);
    expect(part.get().comms.messages.at(-1)?.text).toBe('Got part of it: no fix on where they are, and not what they plan.');

    const store = atTraffic(false);
    store.intercept(trafficId(store.get()));
    for (let t = 0; t < TRANSMISSION_MS && store.get().minigame?.status === 'active'; t += 100) {
      store.tune(store.get().minigame!.signal!.target);
      store.tick(100);
    }
    const s = store.get();
    expect(s.contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
    expect(s.comms.messages.some((m) => m.text.includes('PATROL MOVING TO D3 FOR THE DRONE'))).toBe(true);
    expect(s.intel.pushes.find((p) => p.source === 'SIGINT')?.square).toBe('C2'); // posted on the square it was heard from
    expect(s.comms.messages.some((m) => /\bAT C2\b/.test(m.text))).toBe(false);
  });
});
