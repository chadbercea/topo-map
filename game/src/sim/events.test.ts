import { describe, expect, it } from 'vitest';
import { DEMO_SCHEDULE } from './events';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};

describe('events', () => {
  it('appear on schedule as new, once each', () => {
    const first = DEMO_SCHEDULE[0];
    let s = run(initialState(), first.atMs - 100);
    expect(s.events).toEqual([]);
    s = run(s, 100);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ ...first.event, status: 'new', atMs: first.atMs });
    s = run(s, 1000);
    expect(s.events.filter((e) => e.id === first.event.id)).toHaveLength(1);
  });

  it('do not appear while paused', () => {
    const s = { ...initialState(), phase: 'paused' as const };
    expect(run(s, 60_000).events).toEqual([]);
  });

  it('opening one marks it seen and shows its card; closing hides it', () => {
    const store = createStore();
    store.addEvent({ id: 'x', kind: 'contact', square: 'B2', title: 'Test' });
    expect(store.get().events[0].status).toBe('new');
    store.openEvent('x');
    expect(store.get().openEvent).toBe('x');
    expect(store.get().events[0].status).toBe('seen');
    store.closeEvent();
    expect(store.get().openEvent).toBeNull();
    expect(store.get().events[0].status).toBe('seen');
  });

  it('restart clears events and reschedules them', () => {
    const store = createStore();
    store.addEvent({ id: 'x', kind: 'contact', square: 'B2', title: 'Test' });
    store.restart();
    expect(store.get().events).toEqual([]);
    expect(store.get().schedule).toEqual(DEMO_SCHEDULE);
  });
});
