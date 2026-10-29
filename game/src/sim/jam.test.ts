import { describe, expect, it } from 'vitest';
import { PATROL_JAMMED_MS, PATROL_MOVES_MS, PATROL_WALK_MS } from './missions/blackBox';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { run } from './testkit';

const atTraffic = () => createStore(run(initialState(), 83_000));
const patrolSquare = (s: GameState) => s.contacts.find((c) => c.id === 'patrol')!.square;
// Jump to PATROL_WALK_MS before ms (when it would set off), then to ms.
const at = (s: GameState, ms: number) => step({ ...step({ ...s, elapsedMs: ms - PATROL_WALK_MS - 100 }, 100), elapsedMs: ms - 100 }, 100);

describe('jamming', () => {
  it('blocks their net: the traffic is gone and HQ says what it costs', () => {
    const store = atTraffic();
    store.jam('traffic-c2');
    const s = store.get();
    expect(s.flags.jammed).toBe(true);
    expect(s.events.find((e) => e.id === 'traffic-c2')?.status).toBe('resolved');
    expect(s.comms.messages.find((m) => m.id === 'jam-traffic-c2')?.text).toMatch(/won't hear what they're planning/);
  });

  it('slows the patrol: it reaches the crash site at 6:40, not 4:10', () => {
    const store = atTraffic();
    store.jam('traffic-c2');
    expect(patrolSquare(at(store.get(), PATROL_MOVES_MS))).toBe('C2');
    expect(patrolSquare(at(store.get(), PATROL_JAMMED_MS))).toBe('D3');
  });

  it('costs the intel: no intercept after jamming, and the patrol stays unmarked', () => {
    const store = atTraffic();
    store.jam('traffic-c2');
    store.intercept('traffic-c2');
    expect(store.get().minigame).toBeNull();
    expect(store.get().contacts.find((c) => c.id === 'patrol')?.status).toBe('hidden');
  });
});
