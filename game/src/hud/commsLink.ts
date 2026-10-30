import { waitingCalls } from '../sim/comms';
import type { GameState } from '../sim/state';
import type { LinkState } from './terminalScene'; // a type only: the scene loads lazily

// What's on the RELAY-7 link right now (ILI-1236), read off the game: tied up while a strike's
// mini game runs, sending while an answer of HQ's is on its way up, incoming while a call of
// ALPHA's waits on HQ, else idle. COMMS's terminal and signal trace both follow it.
export function linkTraffic(s: GameState): LinkState {
  if (s.minigame?.status === 'active') return 'tied';
  if (s.comms.inFlight.length) return 'sending';
  if (waitingCalls(s.comms).length) return 'incoming';
  return 'idle';
}

// What the team has in hand, by what it's doing (ILI-1256), for TEAM's box when there's no call:
// its map on the move, the M4 in a fight, the IFAK while the medic works.
export type Gear = 'map' | 'm4' | 'ifak';
export const gearFor = (s: GameState): Gear => (s.team.fight ? 'm4' : s.team.treating || s.team.activity === 'Treating wounded' ? 'ifak' : 'map');
