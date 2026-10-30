import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import type { MapEvent } from './events';
import { dismiss, respond, send } from './comms';
import { cancelLook, capture, closeLook, lookAt, lookSquare, slewMs, type CaptureMode } from './satellite';
import { abortMiniGame, startSeek, tapMiniGame } from './minigame';
import { launchDrone } from './drone';
import { callSniper } from './sniper';
import { weaponBlocked, type Weapon } from './ordnance';
import { applyEffect } from './contacts';
import { sendResupply } from './support';
import { jam, startIntercept, tune } from './signal';
import { step } from './systems';

// The central store every system and panel reads and writes. Phaser drives tick();
// React panels subscribe through useGame().
// Close the square card: no square picked, no event open, ORION-3's last look filed.
const closeSquare = (s: GameState): GameState =>
  s.map.selected || s.openEvent || s.satellite.result
    ? { ...closeLook(s), map: { ...s.map, selected: null }, openEvent: null }
    : s;

// Task ORION-3 to a square. Looking at a square ALPHA is asking about answers its call
// (ILI-1177). ORION-3 is HQ's own: it moves now, with no wait on the link.
function task(s: GameState, square: string): GameState {
  const call = s.comms.messages.find((m) => m.id === s.team.holdFor && m.square === square && m.status === 'new');
  if (call?.responses?.some((r) => r.id === 'send')) return respond(s, call.id, 'send');
  return lookAt(s, square);
}

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
    // No saves in the MVP: retry and restart both start the mission over, live.
    restart: () => set(initialState(state.settings, state.timer.totalMs)),
    // Tuning: start over with a different mission length (1 to 30 minutes).
    setMissionLength: (minutes: number) =>
      set(initialState(state.settings, Math.round(Math.min(30, Math.max(1, minutes)) * 60_000))),
    exit: () => state.phase !== 'exited' && set({ ...state, phase: 'exited' }),
    // Tapping a square opens its card (ILI-1203); tapping it again clears it.
    selectSquare: (id: string | null) => {
      const next = id === state.map.selected ? null : id;
      if (!next) return set(closeSquare(state));
      const open = state.events.find((e) => e.id === state.openEvent);
      set({ ...state, map: { ...state.map, selected: next }, openEvent: open?.square === next ? state.openEvent : null });
    },
    closeSquare: () => set(closeSquare(state)),
    addEvent: (e: Omit<MapEvent, 'atMs' | 'status'>) =>
      set({ ...state, events: [...state.events, { ...e, atMs: state.elapsedMs, status: 'new' }] }),
    // Opening an event marks it seen and opens its square's card; one card at a time.
    openEvent: (id: string) => {
      const e = state.events.find((x) => x.id === id);
      set({
        ...state,
        openEvent: id,
        map: e ? { ...state.map, selected: e.square } : state.map,
        events: state.events.map((x) => (x.id === id && x.status === 'new' ? { ...x, status: 'seen' } : x)),
      });
    },
    closeEvent: () => set(closeSquare(state)),
    // Close an event's panel (its strikes, ILI-1250) and leave its square picked.
    dropEvent: () => state.openEvent && set({ ...state, openEvent: null }),
    confirmCall: (id: string) => set(send(state, id, null)),
    respond: (id: string, responseId: string) => set(send(state, id, responseId)),
    tapMiniGame: (square: string, cell?: number) => state.phase === 'running' && set(tapMiniGame(state, square, cell)),
    fire: (contactId: string, weapon: Weapon) => {
      const c = state.contacts.find((x) => x.id === contactId);
      if (!c || weaponBlocked(state, weapon, c)) return;
      // The drone and the sniper have no mini game: they do it themselves (ILI-1252, ILI-1253).
      set(weapon === 'drone' ? launchDrone(state, contactId) : weapon === 'sniper' ? callSniper(state, contactId) : startSeek(state, contactId, weapon));
    },
    // Send ALPHA at a found contact: answers its call if it's waiting on one, else decides ahead.
    sendTeam: (contactId: string) => {
      const c = state.contacts.find((x) => x.id === contactId);
      if (!c) return;
      const call = state.comms.messages.find((m) => m.id === state.team.holdFor && m.square === c.square && m.status === 'new');
      if (call?.responses?.some((r) => r.id === 'attack')) return set(send(state, call.id, 'attack')); // an order: it goes up the link
      set({ ...applyEffect(state, 'attack', c.square), openEvent: null });
    },
    lookAt: (square: string) => set(task(state, square)),
    // ORION-3 already over the square HQ is working: the shot is one press, no Reposition first
    // (ILI-1250).
    capture: (mode: CaptureMode) => {
      const square = lookSquare(state);
      const there = state.satellite.state === 'idle' && square && slewMs(state, square) === 0;
      set(capture(there ? task(state, square) : state, mode));
    },
    cancelLook: () => set(cancelLook(state)),
    closeLook: () => set(closeLook(state)),
    sendResupply: () => set(sendResupply(state)),
    intercept: (eventId: string) => set(startIntercept(state, eventId)),
    jam: (eventId: string) => set(jam(state, eventId)),
    tune: (mhz: number) => set(tune(state, mhz)),
    abortMiniGame: () => set(abortMiniGame(state)),
    dismissCall: (id: string) => set(dismiss(state, id)),
    setCommsMinimized: (minimized: boolean) => set({ ...state, comms: { ...state.comms, minimized } }),
    setSettings: (patch: Partial<Settings>) => set({ ...state, settings: { ...state.settings, ...patch } }),
  };
}

export type Store = ReturnType<typeof createStore>;

export const game = createStore(initialState());

// Select a primitive or an existing object; a selector that builds a new object every
// call would re-render forever.
export function useGame<T>(select: (s: GameState) => T, store: Store = game): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
