import type { GameState } from './state';
import { movementSystem } from './movement';
import { eventSystem } from './events';
import { commsSystem } from './comms';

// A system reads the state and returns the next one for a fixed slice of mission time.
// New systems (movement, comms, intel) slot into SYSTEMS in the order they should run.
export type System = (state: GameState, dtMs: number) => GameState;

export const timerSystem: System = (s, dt) => {
  const remainingMs = Math.max(0, s.timer.remainingMs - dt);
  return {
    ...s,
    timer: { remainingMs },
    phase: remainingMs === 0 ? 'ended' : s.phase,
  };
};

export const SYSTEMS: System[] = [timerSystem, eventSystem, commsSystem, movementSystem];

// One fixed tick: advance the clocks, then let every system have its turn.
export function step(state: GameState, dtMs: number, systems: System[] = SYSTEMS): GameState {
  if (state.phase !== 'running') return state;
  let next: GameState = { ...state, tick: state.tick + 1, elapsedMs: state.elapsedMs + dtMs };
  for (const system of systems) next = system(next, dtMs);
  return next;
}
