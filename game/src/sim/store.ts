import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import type { MapEvent } from './events';
import { confirm, dismiss, respond } from './comms';
import { boostIntel, sendIntel, type IntelType } from './intel';
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
    addEvent: (e: Omit<MapEvent, 'atMs' | 'status'>) =>
      set({ ...state, events: [...state.events, { ...e, atMs: state.elapsedMs, status: 'new' }] }),
    // Opening an event marks it seen and shows its card; one card at a time.
    openEvent: (id: string) =>
      set({
        ...state,
        openEvent: id,
        events: state.events.map((e) => (e.id === id && e.status === 'new' ? { ...e, status: 'seen' } : e)),
      }),
    closeEvent: () => state.openEvent && set({ ...state, openEvent: null }),
    confirmCall: (id: string) => set(confirm(state, id)),
    respond: (id: string, responseId: string) => set(respond(state, id, responseId)),
    sendIntel: (type: IntelType) => set(sendIntel(state, type)),
    boostIntel: (type: IntelType, amount?: number) => set(boostIntel(state, type, amount)),
    dismissCall: (id: string) => set(dismiss(state, id)),
    setCommsMinimized: (minimized: boolean) => set({ ...state, comms: { ...state.comms, minimized } }),
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
