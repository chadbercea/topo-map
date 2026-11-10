import { useSyncExternalStore } from 'react';
import type { Sighting } from '../sim/sightings';

// Panels over bracketed things (ILI-1411): the one the mouse is over, and the ones HQ pinned by
// clicking (any number; clicking a pinned one again closes it). The map keeps the list of what's
// bracketed this frame; a panel shows only while its thing is.
type Pins = { hovered: string | null; pinned: string[] };
let state: Pins = { hovered: null, pinned: [] };
let seen: Sighting[] = [];
// TANGO numbers (ILI-1412): each fighter gets the next one the first time he's bracketed, and
// keeps it for the mission.
const tangos = new Map<string, number>();
const listeners = new Set<() => void>();
const set = (next: Pins) => {
  state = next;
  listeners.forEach((l) => l());
};

export const pins = {
  get: () => state,
  subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
  hover: (id: string | null) => id !== state.hovered && set({ ...state, hovered: id }),
  toggle: (id: string) => set({ ...state, pinned: state.pinned.includes(id) ? state.pinned.filter((p) => p !== id) : [...state.pinned, id] }),
  clear: () => (tangos.clear(), set({ hovered: null, pinned: [] })),
  // What's bracketed this frame (MapScene).
  setSeen: (list: Sighting[]) => {
    seen = list;
    for (const t of list) if (t.kind === 'hostile' && !tangos.has(t.id)) tangos.set(t.id, tangos.size + 1);
  },
  tango: (id: string) => tangos.get(id) ?? 0,
  seen: () => seen,
};

export const usePins = () => useSyncExternalStore(pins.subscribe, pins.get);

// The kinds that get one of these panels. Event pings and SIGINT diamonds keep their own: a
// name on hover and their card on a click.
export const PANELLED = ['operator', 'hostile', 'site', 'wreck', 'aircraft'] as const;
export const panelled = (t: Sighting) => (PANELLED as readonly string[]).includes(t.kind);
