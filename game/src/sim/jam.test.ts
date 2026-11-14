import { describe, expect, it } from 'vitest';
import { initialState as rolledState } from './state';
import { fixed } from './testkit';
// A fixed enemy layout, not the rolled map (testkit FIXTURE, ILI-1544).
const initialState = (...a: Parameters<typeof rolledState>) => fixed(rolledState(...a));
import { lockedStore as createStore } from './testkit';
import { run, trafficId, untilTraffic } from './testkit';

const atTraffic = () => createStore(untilTraffic(initialState()));

describe('jamming', () => {
  it('blocks their net: the traffic is gone and HQ says what it costs', () => {
    const store = atTraffic();
    const id = trafficId(store.get());
    store.jam(id);
    const s = store.get();
    expect(s.flags.jammed).toBe(true);
    expect(s.events.find((e) => e.id === id)?.status).toBe('resolved');
    expect(s.comms.messages.find((m) => m.id === `jam-${id}`)?.text).toMatch(/won't hear what they're planning/);
  });

  it('a jammed net carries no more traffic (ILI-1454)', () => {
    const store = atTraffic();
    store.jam(trafficId(store.get()));
    const s = run(store.get(), 300_000);
    expect(s.events.filter((e) => e.kind === 'signal' && e.status !== 'resolved')).toEqual([]);
  });

  it('costs the intel: no intercept after jamming, and the patrol stays unmarked', () => {
    const store = createStore(untilTraffic(initialState(), 'B1')); // heard next door: ORION-3 over a scanned C2 would see the patrol itself
    const id = trafficId(store.get());
    store.jam(id);
    store.intercept(id);
    expect(store.get().minigame).toBeNull();
    expect(store.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
  });
});
