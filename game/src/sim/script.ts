import type { Contact } from './contacts';
import type { Scheduled } from './events';
import type { GameState } from './state';
import type { System } from './systems';
import type { Message } from './comms';
import type { SquareId } from '../map/grid';

// A mission is data plus triggers (GDD: scripted, multifaceted decision points with
// different outcomes). A trigger fires once, the first tick its condition holds, and can
// change anything: move a contact, start a call, set a flag. Triggers keep functions,
// so they stay in the mission definition; the game state only records which have fired.

export type Trigger = {
  id: string;
  when: (s: GameState) => boolean;
  then: (s: GameState) => GameState;
};

export type MissionDef = {
  id: string;
  name: string;
  durationMs: number;
  route: SquareId[]; // A first, B (the crash site) at index 3, C last
  contacts: () => Contact[];
  schedule: Scheduled[];
  triggers: Trigger[];
  // Known threats with an ETA, for the mission bar's Next line (ILI-1173).
  threats?: (s: GameState) => { text: string; atMs: number }[];
};

const registry = new Map<string, MissionDef>();
export const registerMission = (m: MissionDef) => (registry.set(m.id, m), m);
export const missionDef = (id: string) => registry.get(id)!;

export const scriptSystem: System = (s) => {
  const def = registry.get(s.script.mission);
  if (!def) return s;
  let next = s;
  for (const t of def.triggers) {
    if (next.script.fired.includes(t.id) || !t.when(next)) continue;
    next = t.then({ ...next, script: { ...next.script, fired: [...next.script.fired, t.id] } });
  }
  return next;
};

// Helpers for writing triggers.
// say: a radio line (log only, unless alert: a short banner for news the map doesn't show).
export const say = (s: GameState, from: string, id: string, text: string, alert = false): GameState => {
  const m: Message = { id, from, text, atMs: s.elapsedMs, status: 'new', holds: false, alert };
  return { ...s, comms: { ...s.comms, messages: [...s.comms.messages, m] } };
};
