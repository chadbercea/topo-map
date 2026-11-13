import { describe, expect, it } from 'vitest';
import { PLAN_JAMMED_MS, PLAN_WALK_MS, planArriveMs } from './enemy';
import { initialState, type GameState } from './state';
import { lockedStore as createStore } from './testkit';
import { step } from './systems';
import { run, trafficId, untilTraffic } from './testkit';

const atTraffic = () => createStore(untilTraffic(initialState()));
const patrolSquare = (s: GameState) => s.contacts.find((c) => c.id === 'patrol')!.square;
// Jump to PLAN_WALK_MS before ms (when it would set off), then to ms.
const at = (s: GameState, ms: number) => step({ ...step({ ...s, elapsedMs: ms - PLAN_WALK_MS - 100 }, 100), elapsedMs: ms - 100 }, 100);

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

  it('slows the patrol: it reaches the crash site PLAN_JAMMED_MS later', () => {
    const store = atTraffic();
    const patrol = () => store.get().contacts.find((c) => c.id === 'patrol')!;
    const unjammed = planArriveMs(store.get(), patrol());
    store.jam(trafficId(store.get()));
    const jammed = planArriveMs(store.get(), patrol());
    expect(jammed).toBe(unjammed + PLAN_JAMMED_MS);
    expect(patrolSquare(at(store.get(), unjammed))).toBe('C2');
    expect(patrolSquare(at(store.get(), jammed))).toBe('D3');
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
