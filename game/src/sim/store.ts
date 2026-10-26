import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import type { MapEvent } from './events';
import { confirm, dismiss, respond } from './comms';
import { boostIntel, sendIntel, type IntelType } from './intel';
import { manualScan } from './scans';
import { abortMiniGame, closeMiniGame, startMiniGame, startSeek, tapMiniGame, type MiniGameKind } from './minigame';
import { weaponBlocked, type Weapon } from './ordnance';
import { applyEffect } from './contacts';
import { sendResupply } from './support';
import { jam, shiftGuess, startIntercept, submitDecode, tune } from './signal';
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
    restart: () => set(initialState(state.settings, state.timer.totalMs)),
    // Tuning: start over with a different mission length (1 to 30 minutes).
    setMissionLength: (minutes: number) =>
      set(initialState(state.settings, Math.round(Math.min(30, Math.max(1, minutes)) * 60_000))),
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
    startMiniGame: (kind: MiniGameKind, square: string) => set(startMiniGame(state, kind, square)),
    tapMiniGame: (square: string, cell?: number) => state.phase === 'running' && set(tapMiniGame(state, square, cell)),
    fire: (contactId: string, weapon: Weapon) => !weaponBlocked(state, weapon) && set(startSeek(state, contactId, weapon)),
    // Send ALPHA at a found contact: answers its call if it's waiting on one, else decides ahead.
    sendTeam: (contactId: string) => {
      const c = state.contacts.find((x) => x.id === contactId);
      if (!c) return;
      const call = state.comms.messages.find((m) => m.id === state.team.holdFor && m.square === c.square && m.status === 'new');
      if (call?.responses?.some((r) => r.id === 'attack')) return set(respond(state, call.id, 'attack'));
      set({ ...applyEffect(state, 'attack', c.square), openEvent: null });
    },
    manualScan: (square: string) => set(manualScan(state, square)),
    sendResupply: () => set(sendResupply(state)),
    intercept: (eventId: string) => set(startIntercept(state, eventId)),
    jam: (eventId: string) => set(jam(state, eventId)),
    tune: (mhz: number) => set(tune(state, mhz)),
    shiftCipher: (delta: number) => set(shiftGuess(state, delta)),
    submitDecode: () => set(submitDecode(state)),
    abortMiniGame: () => set(abortMiniGame(state)),
    closeMiniGame: () => set(closeMiniGame(state)),
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
