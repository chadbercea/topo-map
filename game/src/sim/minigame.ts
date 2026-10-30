import type { SquareId } from '../map/grid';
import type { GameState } from './state';
import type { System } from './systems';
import { finishSignal, type Signal } from './signal';

// Mini games play on the theater map itself (GDD). Starting one puts the map in that game's
// mode and opens a companion panel; the result feeds back into the mission: the team gets
// what it asked for (or doesn't) and the matching intel type jumps ahead.

export type MiniGameKind = 'signal'; // strikes are automated now (air.ts, sniper.ts)
export type MiniGameStatus = 'active' | 'won' | 'lost';

export type MiniGame = {
  kind: MiniGameKind;
  square: SquareId; // where it's centred
  callId?: string; // the radio call that asked for it; the team holds on it
  eventId?: string;
  startedMs: number;
  durationMs: number;
  targets: SquareId[];
  hits: number;
  misses: number;
  status: MiniGameStatus;
  // Listen (signal intercept) only:
  signal?: Signal;
};

type Def = { title: string; instructions: string };

// The satellite used to be a mini game here (tap squares in order); it's ORION-3 tasking now
// (satellite.ts).
export const MINIGAMES: Record<MiniGameKind, Def> = {
  signal: {
    title: 'Listen',
    instructions: 'Drag to lay your line over theirs and keep it there. They hop every few seconds: follow them.',
  },
};

export const BOARD = 4; // cells per side of the 4x4 a square's fighters stand on

export const timeLeft = (s: GameState) => {
  const m = s.minigame;
  if (!m) return 0;
  return Math.max(0, m.startedMs + m.durationMs - s.elapsedMs);
};

export const abortMiniGame = (s: GameState) => (s.minigame?.status === 'active' ? finish(s, 'lost') : s);

// Close the result panel once the player has seen it.
export const minigameSystem: System = (s) => (s.minigame?.status === 'active' && timeLeft(s) === 0 ? finish(s, 'lost') : s);

function finish(s: GameState, status: 'won' | 'lost'): GameState {
  return finishSignal(s, status);
}
