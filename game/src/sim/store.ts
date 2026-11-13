import { useSyncExternalStore } from 'react';
import { initialState, type GameState, type Settings } from './state';
import type { MapEvent } from './events';
import { dismiss, respond, send } from './comms';
import { allPrompts } from './prompts';
import { cancelLook, capture, closeLook, lockedOn, lookAt, lookSquare, scan, slewMs, type CaptureMode } from './satellite';
import { abortMiniGame } from './minigame';
import { launch } from './air';
import { callSniper } from './sniper';
import { unlock, unlockedWeapons, weaponBlocked, type Weapon } from './ordnance';
import { perCall } from './upgrades';
import { postBuilding } from './buildings';
import { spend } from './sites';
import { sendResupply } from './support';
import { jam, listenWith, tune } from './signal';
import { step } from './systems';
import { reopen } from './intel';

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

// Scan a square (ILI-1367): the photo, only with ORION-3 locked on it (ILI-1397).
function scanSquare(s: GameState, square: string): GameState {
  if (!lockedOn(s, square)) return s;
  const next = task(s, square);
  return next.satellite.aim === square ? scan(next) : next;
}

// An action HQ took on a square (a strike, building intel, a jam) opens it to Analyze again (ILI-1516).
const acted = (before: GameState, next: GameState, square: string | undefined) => (next === before || !square ? next : reopen(next, square));

// Where an event happens: its square, for the lock check (ILI-1397).
const eventSquare = (s: GameState, eventId: string) => s.events.find((e) => e.id === eventId)?.square;

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
    restart: (opening = state.resources.ledger.opening, unlocked: readonly Weapon[] = unlockedWeapons(state), upgrades: readonly string[] = state.upgrades) => set(keepBase(initialState(state.settings, state.timer.totalMs, opening, unlocked, upgrades, state.seed))),
    // Set the carried balance before the clock starts (the device's saved one, ILI-1316).
    setOpening: (opening: number, unlocked: readonly Weapon[] = [], upgrades: readonly string[] = []) => state.elapsedMs === 0 && set(keepBase(initialState(state.settings, state.timer.totalMs, opening, unlocked, upgrades, state.seed))),
    // Post intel on a building a scan turned up for ALPHA to pull (ILI-1316, ILI-1517).
    // Like every action on a square, only with ORION-3 locked on it (ILI-1397).
    postBuilding: (square: string) => lockedOn(state, square) && set(acted(state, postBuilding(state, square), square)),
    // Buy a capability (ILI-1316).
    unlock: (w: Weapon) => set(unlock(state, w)),
    // Replay a mission exactly, or play another (?seed=, ILI-1454): start over on that seed.
    setSeed: (seed: number) => set(keepBase(initialState(state.settings, state.timer.totalMs, state.resources.ledger.opening, unlockedWeapons(state), state.upgrades, seed >>> 0))),
    // Tuning: start over with a different mission length (1 to 30 minutes).
    setMissionLength: (minutes: number) =>
      set(keepBase(initialState(state.settings, Math.round(Math.min(30, Math.max(1, minutes)) * 60_000), 0, [], [], state.seed))),
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
      const at = eventSquare(state, `contact-${contactId}`) ?? c.square;
      if (!lockedOn(state, at)) return; // the satellite is locked on its square first (ILI-1397)
      // No mini games: the support does it itself (ILI-1252, ILI-1253, ILI-1254).
      // Every call that goes out costs (ILI-1316), into the red if need be.
      const called = weapon === 'sniper' ? callSniper(state, contactId) : launch(state, weapon, contactId);
      set(called === state ? state : acted(state, spend(called, perCall(state, weapon)), at));
    },
    lookAt: (square: string) => set(task(state, square)),
    // The move step (ILI-1397): ORION-3 slews to the square, in real time, before anything runs there.
    moveSatellite: (square: string) => set(task(state, square)),
    // Analyze (ILI-1367, ILI-1499): image the square, report, and post its package for ALPHA, once ORION-3 is locked on (ILI-1397).
    scan: (square: string) => set(scanSquare(state, square)),
    // Answer the prompt on screen (ILI-1391): the response does what it says.
    answerPrompt: (id: string, response: string) => {
      const p = allPrompts(state).find((x) => x.id === id);
      if (!p || p.responses.find((r) => r.id === response)?.disabled) return;
      // Get an asset in range of enemy traffic; the intercept starts once it is (ILI-1394).
      if (p.kind === 'enemy-traffic' && response === 'satellite') set(listenWith(state, p.id, 'satellite')); // HQ listens; no antenna (ILI-1435)
      // An operator in trouble (ILI-1396): seen to. The HUD opens the team drawer on it.
      if (p.kind === 'operator') set({ ...state, acked: [...state.acked, p.id] });
      // ALPHA's call (ILI-1393): a reply, or a plain Copy.
      if (p.kind === 'team-call') set(send(state, p.id, response === 'copy' ? null : response));
    },
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
    jam: (eventId: string) => lockedOn(state, eventSquare(state, eventId) ?? '') && set(acted(state, jam(state, eventId), eventSquare(state, eventId))),
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
