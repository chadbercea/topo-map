import { roster, type Operator } from './team';
import type { SquareId } from '../map/grid';
import { squareCenter } from '../map/grid';

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
    position: { x: number; y: number }; // world units
    route: SquareId[]; // squares the team walks through, in order
    waypoint: number; // index into route of the square it's heading for
    activity: string;
  };
  map: { cols: number; rows: number; scanned: string[]; selected: string | null };
  resources: { budget: number; scans: number };
  settings: Settings; // survives restart
};

// Placeholder route until the mission's A to B to C route lands (ILI-1138).
export const ROUTE: SquareId[] = ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'];

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
      position: squareCenter(ROUTE[0])!,
      route: ROUTE,
      waypoint: 1,
      activity: `Moving to ${ROUTE[1]}`,
    },
    map: { cols: 8, rows: 5, scanned: [], selected: null },
    resources: { budget: 0, scans: 3 },
    settings,
  };
}
