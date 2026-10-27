import { describe, expect, it, vi } from 'vitest';
import { initialState, MISSION_MS } from './state';
import { createStore } from './store';
import { step, type System } from './systems';
import { lookSquare } from './satellite';

describe('step', () => {
  it('advances tick, mission time and the timer', () => {
    const s = step(initialState(), 100);
    expect(s.tick).toBe(1);
    expect(s.elapsedMs).toBe(100);
    expect(s.timer.remainingMs).toBe(MISSION_MS - 100);
  });

  it('never mutates the previous state', () => {
    const before = initialState();
    const copy = structuredClone(before);
    step(before, 100);
    expect(before).toEqual(copy);
  });

  it('runs every system in order with the tick length', () => {
    const calls: string[] = [];
    const a: System = (s, dt) => (calls.push(`a${dt}`), s);
    const b: System = (s, dt) => (calls.push(`b${dt}`), s);
    step(initialState(), 100, [a, b]);
    expect(calls).toEqual(['a100', 'b100']);
  });

  it('ends the mission when the timer runs out, then stops', () => {
    let s = { ...initialState(), timer: { remainingMs: 150, totalMs: 360_000 } };
    s = step(s, 100);
    expect(s.phase).toBe('running');
    s = step(s, 100);
    expect(s.timer.remainingMs).toBe(0);
    expect(s.phase).toBe('ended');
    expect(step(s, 100)).toBe(s);
  });
});

describe('store', () => {
  it('notifies subscribers on change only', () => {
    const store = createStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.tick(100);
    store.resume(); // already running: no change
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.tick(100);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('freezes everything while paused and picks up where it left off', () => {
    const store = createStore();
    store.tick(100);
    store.pause();
    const frozen = store.get();
    for (let i = 0; i < 50; i++) store.tick(100);
    expect(store.get()).toBe(frozen);
    expect(frozen.phase).toBe('paused');
    store.resume();
    store.tick(100);
    expect(store.get().tick).toBe(2);
    expect(store.get().timer.remainingMs).toBe(MISSION_MS - 200);
  });

  it('restarts from a fresh mission', () => {
    const store = createStore();
    store.tick(100);
    store.pause();
    store.restart();
    expect(store.get()).toEqual(initialState());
  });
});

describe('pause menu actions', () => {
  it('keeps settings across a restart', () => {
    const store = createStore();
    store.setSettings({ city: false });
    store.tick(100);
    store.restart();
    expect(store.get().tick).toBe(0);
    expect(store.get().phase).toBe('running');
    expect(store.get().settings.city).toBe(false);
  });

  it('exit stops the mission and restart brings it back', () => {
    const store = createStore();
    store.exit();
    store.tick(100);
    expect(store.get().phase).toBe('exited');
    expect(store.get().tick).toBe(0);
    store.resume(); // resume only applies to a paused mission
    expect(store.get().phase).toBe('exited');
    store.restart();
    expect(store.get().phase).toBe('running');
  });
});

describe('map selection', () => {
  it('selects a square, and tapping it again clears it', () => {
    const store = createStore();
    store.selectSquare('C2');
    expect(store.get().map.selected).toBe('C2');
    store.selectSquare('D3');
    expect(store.get().map.selected).toBe('D3');
    store.selectSquare('D3');
    expect(store.get().map.selected).toBeNull();
  });

  it('opening an event opens its square\'s card; another square closes the event; × clears it all (ILI-1203)', () => {
    const store = createStore();
    store.addEvent({ id: 'x', kind: 'contact', square: 'C2', title: 'Test' });
    store.openEvent('x');
    expect(store.get().map.selected).toBe('C2');
    expect(lookSquare(store.get())).toBe('C2');
    store.selectSquare('D3');
    expect(store.get().openEvent).toBeNull();
    store.openEvent('x');
    store.closeSquare();
    expect(store.get().map.selected).toBeNull();
    expect(store.get().openEvent).toBeNull();
  });

  it('the card follows ORION-3 to the square it was sent to, and stays on the look until closed', () => {
    const store = createStore();
    store.selectSquare('C2');
    store.lookAt('C2');
    expect(lookSquare(store.get())).toBe('C2');
    for (let i = 0; i < 300 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    store.capture('photo');
    expect(lookSquare(store.get())).toBe('C2');
    store.closeSquare();
    expect(lookSquare(store.get())).toBeNull();
  });
});
