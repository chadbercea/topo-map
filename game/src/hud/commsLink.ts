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
