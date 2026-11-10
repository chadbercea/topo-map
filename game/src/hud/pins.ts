import { useSyncExternalStore } from 'react';
import type { Sighting } from '../sim/sightings';

// Panels over bracketed things (ILI-1411): the one the mouse is over, and the ones HQ pinned by
// clicking (any number; clicking a pinned one again closes it). The map keeps the list of what's
// bracketed this frame; a panel shows only while its thing is.
type Pins = { hovered: string | null; pinned: string[] };
let state: Pins = { hovered: null, pinned: [] };
let seen: Sighting[] = [];
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
  clear: () => set({ hovered: null, pinned: [] }),
  // What's bracketed this frame (MapScene).
  setSeen: (list: Sighting[]) => void (seen = list),
  seen: () => seen,
};

export const usePins = () => useSyncExternalStore(pins.subscribe, pins.get);

// The kinds that get one of these panels. Event pings and SIGINT diamonds keep their own: a
// name on hover and their card on a click.
export const PANELLED = ['operator', 'hostile', 'site', 'wreck'] as const;
export const panelled = (t: Sighting) => (PANELLED as readonly string[]).includes(t.kind);
