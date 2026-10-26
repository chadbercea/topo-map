import { COLS, parseSquare, ROWS, squareId, type SquareId } from '../map/grid';
import { nextRandom } from './firefight';
import { boostIntel, type IntelType } from './intel';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';

// Mini games play on the theater map itself (GDD). Starting one puts the map in that game's
// mode and opens a companion panel; the result feeds back into the mission: the team gets
// what it asked for (or doesn't) and the matching intel type jumps ahead.

export type MiniGameKind = 'gridScan';
export type MiniGameStatus = 'active' | 'won' | 'lost';

export type MiniGame = {
  kind: MiniGameKind;
  square: SquareId; // where it's centred
  callId?: string; // the radio call that asked for it; the team holds on it
  eventId?: string;
  startedMs: number;
  durationMs: number;
  targets: SquareId[]; // in the order they must be tapped
  hits: number;
  misses: number;
  status: MiniGameStatus;
};

type Def = {
  title: string;
  instructions: string;
  intel: IntelType;
  durationMs: number;
  build: (square: SquareId, rng: number) => [SquareId[], number];
  won: string; // what the team radios on success
  lost: string;
};

// Grid scan, first cut: tap the satellite's target squares in order before the pass ends.
// The look and feel of Chad's prototype is ported in ILI-1128.
const neighbours = (sq: SquareId) => {
  const { col, row } = parseSquare(sq)!;
  const out: SquareId[] = [];
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]])
    if (col + dc >= 0 && col + dc < COLS && row + dr >= 0 && row + dr < ROWS) out.push(squareId(col + dc, row + dr));
  return out;
};

export const MINIGAMES: Record<MiniGameKind, Def> = {
  gridScan: {
    title: 'Satellite grid scan',
    instructions: 'Tap the squares in order before the satellite pass ends.',
    intel: 'imagery',
    durationMs: 10_000,
    build: (square, rng) => {
      const pool = neighbours(square);
      const picks: SquareId[] = [];
      for (let i = 0; i < 3 && pool.length; i++) {
        let r: number;
        [r, rng] = nextRandom(rng);
        picks.push(pool.splice(Math.floor(r * pool.length), 1)[0]);
      }
      return [[square, ...picks], rng];
    },
    won: 'Imagery is good. Area clear. Moving.',
    lost: 'No usable imagery. Moving anyway.',
  },
};

const MISS_PENALTY_MS = 1_000;

export function startMiniGame(s: GameState, kind: MiniGameKind, square: SquareId, callId?: string, eventId?: string): GameState {
  const def = MINIGAMES[kind];
  const [targets, rng] = def.build(square, s.rng);
  return {
    ...s,
    rng,
    openEvent: null,
    minigame: { kind, square, callId, eventId, startedMs: s.elapsedMs, durationMs: def.durationMs, targets, hits: 0, misses: 0, status: 'active' },
    team: callId ? { ...s.team, holdFor: callId, activity: 'Waiting on imagery' } : s.team,
  };
}

export const timeLeft = (s: GameState) =>
  s.minigame ? Math.max(0, s.minigame.startedMs + s.minigame.durationMs - s.minigame.misses * MISS_PENALTY_MS - s.elapsedMs) : 0;

// A tap on the map while a mini game runs: the next target scores, anything else costs time.
export function tapMiniGame(s: GameState, square: SquareId): GameState {
  const m = s.minigame;
  if (!m || m.status !== 'active') return s;
  if (square !== m.targets[m.hits]) return { ...s, minigame: { ...m, misses: m.misses + 1 } };
  const hits = m.hits + 1;
  const next = { ...s, minigame: { ...m, hits } };
  return hits === m.targets.length ? finish(next, 'won') : next;
}

export const abortMiniGame = (s: GameState) => (s.minigame?.status === 'active' ? finish(s, 'lost') : s);

// Close the result panel once the player has seen it.
export const closeMiniGame = (s: GameState) => (s.minigame && s.minigame.status !== 'active' ? { ...s, minigame: null } : s);

export const minigameSystem: System = (s) => (s.minigame?.status === 'active' && timeLeft(s) === 0 ? finish(s, 'lost') : s);

function finish(s: GameState, status: 'won' | 'lost'): GameState {
  const m = s.minigame!;
  const def = MINIGAMES[m.kind];
  let next: GameState = { ...s, minigame: { ...m, status } };
  if (status === 'won') {
    next = boostIntel(next, def.intel);
    const scanned = [...new Set([...next.map.scanned, ...m.targets])];
    next = { ...next, map: { ...next.map, scanned } };
  }
  const reply: Message = {
    id: `minigame-${m.startedMs}`,
    from: s.team.callsign,
    text: status === 'won' ? def.won : def.lost,
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  return {
    ...next,
    events: m.eventId ? next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)) : next.events,
    team: next.team.holdFor === m.callId ? { ...next.team, holdFor: null } : next.team,
    comms: { ...next.comms, messages: [...next.comms.messages, reply] },
  };
}
