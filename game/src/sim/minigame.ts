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
  hitAt: number[]; // mission time of each hit, for the scanning pulse
  misses: number;
  status: MiniGameStatus;
};

type Def = {
  title: string;
  instructions: string;
  intel: IntelType;
  durationMs: number;
  build: (s: GameState, square: SquareId) => [SquareId[], number];
  callsign: string; // who runs it on the radio
  won: string; // what the team radios on success
  lost: string;
};

// Grid scan, ported from the War Room prototype (war-room.html): the ORION-3 satellite
// images squares for ALPHA, each square pulses while it's being imaged and stays marked
// afterwards. Here the pass is a mini game: tap the squares in order before it ends. The
// squares are the ones the team needs: the one it asked about, then unimaged squares
// ahead on its route, topped up with neighbours.
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
    callsign: 'ORION-3',
    build: (s, square) => {
      const { route, waypoint } = s.team;
      const ahead = route.slice(waypoint).filter((sq) => sq !== square && !s.map.scanned.includes(sq));
      const picks = ahead.slice(0, 3);
      const pool = neighbours(square).filter((sq) => !picks.includes(sq) && !s.map.scanned.includes(sq));
      let rng = s.rng;
      while (picks.length < 3 && pool.length) {
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
  const [targets, rng] = def.build(s, square);
  const pass = radio(s, def.callsign, `pass-${s.elapsedMs}`, `Pass over ${square}. Imaging ${targets.join(', ')}.`, 'read');
  return {
    ...s,
    rng,
    openEvent: null,
    minigame: { kind, square, callId, eventId, startedMs: s.elapsedMs, durationMs: def.durationMs, targets, hits: 0, hitAt: [], misses: 0, status: 'active' },
    team: callId ? { ...s.team, holdFor: callId, activity: 'Waiting on imagery' } : s.team,
    comms: { ...s.comms, messages: [...s.comms.messages, pass] },
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
  const next = { ...s, minigame: { ...m, hits, hitAt: [...m.hitAt, s.elapsedMs] } };
  return hits === m.targets.length ? finish(next, 'won') : next;
}

export const abortMiniGame = (s: GameState) => (s.minigame?.status === 'active' ? finish(s, 'lost') : s);

// Close the result panel once the player has seen it.
export const closeMiniGame = (s: GameState) => (s.minigame && s.minigame.status !== 'active' ? { ...s, minigame: null } : s);

export const minigameSystem: System = (s) => (s.minigame?.status === 'active' && timeLeft(s) === 0 ? finish(s, 'lost') : s);

const radio = (s: GameState, from: string, id: string, text: string, status: Message['status']): Message => ({
  id,
  from,
  text,
  atMs: s.elapsedMs,
  status,
  holds: false,
});

function finish(s: GameState, status: 'won' | 'lost'): GameState {
  const m = s.minigame!;
  const def = MINIGAMES[m.kind];
  let next: GameState = { ...s, minigame: { ...m, status } };
  if (status === 'won') {
    next = boostIntel(next, def.intel);
    const scanned = [...new Set([...next.map.scanned, ...m.targets])];
    next = { ...next, map: { ...next.map, scanned } };
  }
  const sat = radio(s, def.callsign, `minigame-${m.startedMs}-sat`,
    status === 'won' ? `${m.targets.join(', ')} imaged. Downlinked to ${s.team.callsign}.` : 'Pass ended. No usable imagery.', 'read');
  const reply = radio(s, s.team.callsign, `minigame-${m.startedMs}`, status === 'won' ? def.won : def.lost, 'new');
  return {
    ...next,
    events: m.eventId ? next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)) : next.events,
    team: next.team.holdFor === m.callId ? { ...next.team, holdFor: null } : next.team,
    comms: { ...next.comms, messages: [...next.comms.messages, sat, reply] },
  };
}
