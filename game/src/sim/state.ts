import { roster, type Operator } from './team';

// The whole game in one plain object. Systems never mutate it: each tick returns a new
// state, so React can tell what changed by reference and tests can compare snapshots.

// paused: pause menu open. ended: timer ran out. exited: player left the mission.
export type Phase = 'running' | 'paused' | 'ended' | 'exited';

export type Settings = { sound: boolean };

export type GameState = {
  tick: number;
  elapsedMs: number; // mission time actually played, excludes pauses
  phase: Phase;
  timer: { remainingMs: number };
  team: {
    callsign: string;
    operators: Operator[];
    position: { col: number; row: number };
    activity: string;
  };
  map: { cols: number; rows: number; scanned: string[]; selected: string | null };
  resources: { budget: number; scans: number };
  settings: Settings; // survives restart
};

export const MISSION_MS = 6 * 60 * 1000; // GDD: start with six minutes and tune by feel

export function initialState(settings: Settings = { sound: true }): GameState {
  return {
    tick: 0,
    elapsedMs: 0,
    phase: 'running',
    timer: { remainingMs: MISSION_MS },
    team: {
      callsign: 'ALPHA',
      operators: roster(),
      position: { col: 0, row: 0 },
      activity: 'Infiltrating',
    },
    map: { cols: 8, rows: 5, scanned: [], selected: null },
    resources: { budget: 0, scans: 3 },
    settings,
  };
}
