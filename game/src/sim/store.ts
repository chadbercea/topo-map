import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import { step } from './systems';

// The central store every system and panel reads and writes. Phaser drives tick();
// React panels subscribe through useGame().
export function createStore(initial: GameState = initialState()) {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: GameState) => {
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
  };

  return {
    get: () => state,
    set,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    tick: (dtMs: number) => set(step(state, dtMs)),
    pause: () => state.phase === 'running' && set({ ...state, phase: 'paused' }),
    resume: () => state.phase === 'paused' && set({ ...state, phase: 'running' }),
    // No saves in the MVP: retry and restart both start the mission over.
    restart: () => set(initialState(state.settings)),
    exit: () => state.phase !== 'exited' && set({ ...state, phase: 'exited' }),
    // Tapping the selected square again clears it.
    selectSquare: (id: string | null) =>
      set({ ...state, map: { ...state.map, selected: id === state.map.selected ? null : id } }),
    setSettings: (patch: Partial<Settings>) => set({ ...state, settings: { ...state.settings, ...patch } }),
  };
}

export type Store = ReturnType<typeof createStore>;

export const game = createStore();

// Select a primitive or an existing object; a selector that builds a new object every
// call would re-render forever.
export function useGame<T>(select: (s: GameState) => T, store: Store = game): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
