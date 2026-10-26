import type { GameState } from './state';
import { movementSystem } from './movement';
import { eventSystem } from './events';
import { commsSystem } from './comms';
import { vitalsFor } from './team';
import { firefightSystem } from './firefight';
import { intelSystem } from './intel';
import { minigameSystem } from './minigame';
import { scanSystem } from './scans';
import { approachSystem } from './contacts';
import { siteSystem } from './sites';
import { noiseSystem } from './noise';
import { signalSystem } from './signal';
import { missionSystem } from './mission';
import { scriptSystem } from './script';

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

// Any change to health, ammo or meds (a fight, a wound, the medic at work) keeps the team
// readout in its full Mode B for a few seconds after it stops.
export const ACTIVE_MS = 5_000;

export const readoutSystem: System = (s) => {
  const vitals = vitalsFor(s.team.operators);
  if (vitals === s.team.vitals) return s;
  return { ...s, team: { ...s.team, vitals, activeUntilMs: s.elapsedMs + ACTIVE_MS } };
};

export const SYSTEMS: System[] = [timerSystem, noiseSystem, eventSystem, scriptSystem, intelSystem, scanSystem, signalSystem, minigameSystem, commsSystem, approachSystem, siteSystem, firefightSystem, missionSystem, movementSystem, readoutSystem];

// One fixed tick: advance the clocks, then let every system have its turn.
export function step(state: GameState, dtMs: number, systems: System[] = SYSTEMS): GameState {
  if (state.phase !== 'running') return state;
  let next: GameState = { ...state, tick: state.tick + 1, elapsedMs: state.elapsedMs + dtMs };
  for (const system of systems) next = system(next, dtMs);
  return next;
}

export const teamMode = (s: GameState): 'A' | 'B' => (s.elapsedMs < s.team.activeUntilMs ? 'B' : 'A');
