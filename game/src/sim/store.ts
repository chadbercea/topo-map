import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import type { MapEvent } from './events';
import { dismiss, respond, send } from './comms';
import { cancelLook, capture, closeLook, lookAt, lookSquare, slewMs, type CaptureMode } from './satellite';
import { abortMiniGame } from './minigame';
import { launch } from './air';
import { callSniper } from './sniper';
import { unlock, unlockedWeapons, weaponBlocked, type Weapon } from './ordnance';
import { PER_CALL } from './prices';
import { spend } from './sites';
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

  const keepBase = (s: GameState): GameState => ({ ...s, intel: { ...s.intel, base: state.intel.base } });
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
    // A new mission opens on the balance HQ carries in (ILI-1316): the last one's, unless given.
    restart: (opening = state.resources.ledger.opening, unlocked: readonly Weapon[] = unlockedWeapons(state)) => set(keepBase(initialState(state.settings, state.timer.totalMs, opening, unlocked))),
    // Set the carried balance before the clock starts (the device's saved one, ILI-1316).
    setOpening: (opening: number, unlocked: readonly Weapon[] = []) => state.elapsedMs === 0 && set(keepBase(initialState(state.settings, state.timer.totalMs, opening, unlocked))),
    // Buy a capability (ILI-1316).
    unlock: (w: Weapon) => set(unlock(state, w)),
    // Tuning: start over with a different mission length (1 to 30 minutes).
    setMissionLength: (minutes: number) =>
      set(keepBase(initialState(state.settings, Math.round(Math.min(30, Math.max(1, minutes)) * 60_000)))),
    // Tuning and tests: a fixed offset on ALPHA's intel gauge that survives restarts (ILI-1314).
    setIntelBase: (base: number) => set({ ...state, intel: { ...state.intel, base } }),
    exit: () => state.phase !== 'exited' && set({ ...state, phase: 'exited' }),
    // The intro holds the clock until the war room is online, then starts it (ILI-1282).
    standby: () => state.phase === 'running' && state.elapsedMs === 0 && set({ ...state, phase: 'standby' }),
    go: () => state.phase === 'standby' && set({ ...state, phase: 'running' }),
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
    fire: (contactId: string, weapon: Weapon) => {
      const c = state.contacts.find((x) => x.id === contactId);
      if (!c || weaponBlocked(state, weapon, c)) return;
      // No mini games: the support does it itself (ILI-1252, ILI-1253, ILI-1254).
      // Every call that goes out costs (ILI-1316), into the red if need be.
      const called = weapon === 'sniper' ? callSniper(state, contactId) : launch(state, weapon, contactId);
      set(called === state ? state : spend(called, PER_CALL[weapon]));
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
