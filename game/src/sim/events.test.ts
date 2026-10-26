import { describe, expect, it } from 'vitest';
import type { Scheduled } from './events';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run } from './testkit';

const SCHEDULE: Scheduled[] = [{ atMs: 2_000, event: { id: 'x', kind: 'contact', square: 'B4', title: 'Test' } }];
const scheduled = (): GameState => ({ ...initialState(), schedule: SCHEDULE });

describe('events', () => {
  it('appear on schedule as new, once each', () => {
    let s = run(scheduled(), 1_900);
    expect(s.events).toEqual([]);
    s = run(s, 100);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ ...SCHEDULE[0].event, status: 'new', atMs: 2_000 });
    expect(run(s, 1_000).events).toHaveLength(1);
  });

  it('do not appear while paused', () => {
    expect(run({ ...scheduled(), phase: 'paused' }, 10_000).events).toEqual([]);
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

  it('restart clears events', () => {
    const store = createStore();
    store.addEvent({ id: 'x', kind: 'contact', square: 'B2', title: 'Test' });
    store.restart();
    expect(store.get().events).toEqual([]);
  });
});
