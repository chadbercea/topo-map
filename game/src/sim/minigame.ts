import { COLS, parseSquare, ROWS, squareId, type SquareId } from '../map/grid';
import { nextRandom } from './firefight';
import { boostIntel, type IntelType } from './intel';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { reveal } from './contacts';
import { spendWeapon, WEAPON, type Weapon } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';
import { makeNoise, NOISE } from './noise';

// Mini games play on the theater map itself (GDD). Starting one puts the map in that game's
// mode and opens a companion panel; the result feeds back into the mission: the team gets
// what it asked for (or doesn't) and the matching intel type jumps ahead.

export type MiniGameKind = 'gridScan' | 'seekDestroy';
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
  // Seek and destroy only:
  weapon?: Weapon;
  contactId?: string;
  shots?: { cell: number; hit: boolean; atMs: number }[];
  roundsLeft?: number;
  nextShotMs?: number;
  spotted?: number[]; // cells the team already saw a fighter in (observe)
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
    won: 'Imagery received.',
    lost: 'No usable imagery. Moving anyway.',
  },
  // Seek and destroy (GDD, Battleship-style): the target's square becomes a 4x4 board and
  // its fighters hide in the cells. Fire on cells; a hit is a kill, a miss is a miss.
  seekDestroy: {
    title: 'Seek and destroy',
    instructions: 'Fire on the cells where you think they are.',
    intel: 'target',
    durationMs: 15_000,
    callsign: 'OVERWATCH',
    build: (s, square) => [[square], s.rng],
    won: 'Target destroyed.',
    lost: 'Some of them got away.',
  },
};

export const BOARD = 4; // cells per side
const CALLSIGN: Record<Weapon, string> = { drone: 'REAPER-1', sniper: 'OVERWATCH', heli: 'HAMMER-2' };

// Fire a weapon at a found contact: the map turns into its board.
export function startSeek(s: GameState, contactId: string, weapon: Weapon): GameState {
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c || c.status !== 'revealed') return s;
  const w = WEAPON[weapon];
  const next = spendWeapon(s, weapon);
  return {
    ...next,
    openEvent: null,
    minigame: {
      kind: 'seekDestroy',
      square: c.square,
      contactId,
      eventId: `contact-${c.id}`,
      weapon,
      startedMs: s.elapsedMs,
      durationMs: w.runMs,
      targets: [c.square],
      hits: 0,
      hitAt: [],
      misses: 0,
      status: 'active',
      shots: [],
      roundsLeft: w.rounds,
      nextShotMs: s.elapsedMs,
      spotted: c.observed ? c.units.slice(0, 1) : [],
    },
  };
}

// The drone's blast covers the cell tapped and the ones right and below it.
const blast = (cell: number) => {
  const r = Math.floor(cell / BOARD);
  const c = cell % BOARD;
  const out = [cell];
  if (c + 1 < BOARD) out.push(cell + 1);
  if (r + 1 < BOARD) out.push(cell + BOARD);
  if (c + 1 < BOARD && r + 1 < BOARD) out.push(cell + BOARD + 1);
  return out;
};

function seekTap(s: GameState, square: SquareId, cell: number | undefined): GameState {
  const m = s.minigame!;
  if (square !== m.square || cell === undefined || !m.roundsLeft || s.elapsedMs < (m.nextShotMs ?? 0)) return s;
  const c = s.contacts.find((x) => x.id === m.contactId)!;
  const cells = m.weapon === 'drone' ? blast(cell) : [cell];
  const kills = c.units.filter((u) => cells.includes(u));
  const shots = [...(m.shots ?? []), ...cells.map((x) => ({ cell: x, hit: kills.includes(x), atMs: s.elapsedMs }))];
  const units = c.units.filter((u) => !kills.includes(u));
  const loud = m.weapon === 'drone' ? NOISE.drone : m.weapon === 'heli' ? NOISE.heli / WEAPON.heli.rounds : NOISE.sniperRound;
  const next: GameState = {
    ...makeNoise(earn(s, kills.length * CASH_PER_STRIKE_KILL), loud), // kills pay; every shot is heard
    contacts: s.contacts.map((x) => (x === c ? { ...x, units } : x)),
    minigame: {
      ...m,
      shots,
      hits: m.hits + kills.length,
      misses: m.misses + (kills.length ? 0 : 1),
      roundsLeft: m.roundsLeft - 1,
      nextShotMs: s.elapsedMs + WEAPON[m.weapon!].cycleMs,
    },
  };
  if (!units.length) return finish(next, 'won');
  if (next.minigame!.roundsLeft === 0) return finish(next, 'lost');
  return next;
}

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

export const timeLeft = (s: GameState) => {
  const m = s.minigame;
  if (!m) return 0;
  const penalty = m.kind === 'gridScan' ? m.misses * MISS_PENALTY_MS : 0; // a missed shot costs a round, not time
  return Math.max(0, m.startedMs + m.durationMs - penalty - s.elapsedMs);
};

// A tap on the map while a mini game runs: the next target scores, anything else costs time.
export function tapMiniGame(s: GameState, square: SquareId, cell?: number): GameState {
  const m = s.minigame;
  if (!m || m.status !== 'active') return s;
  if (m.kind === 'seekDestroy') return seekTap(s, square, cell);
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
  if (m.kind === 'seekDestroy') return finishSeek(s, status);
  const def = MINIGAMES[m.kind];
  let next: GameState = { ...s, minigame: { ...m, status } };
  if (status === 'won') {
    next = boostIntel(next, def.intel);
    const scanned = [...new Set([...next.map.scanned, ...m.targets])];
    next = reveal({ ...next, map: { ...next.map, scanned } }, m.targets, def.callsign);
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

function finishSeek(s: GameState, status: 'won' | 'lost'): GameState {
  const m = s.minigame!;
  const c = s.contacts.find((x) => x.id === m.contactId)!;
  const left = c.units.length;
  let next: GameState = { ...s, minigame: { ...m, status } };
  if (status === 'won') {
    next = boostIntel(next, 'target');
    next = {
      ...next,
      contacts: next.contacts.map((x) => (x.id === c.id ? { ...x, status: 'cleared' as const } : x)),
      events: next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)),
    };
    next = markSite(next, c);
  }
  const pay = m.hits ? ` +$${(m.hits * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` : '';
  const text = status === 'won' ? `${m.square}: target destroyed. ${m.hits} down.${pay}` : `${m.square}: ${m.hits} down, ${left} still in there.${pay}`;
  const report = radio(s, CALLSIGN[m.weapon!], `seek-${m.startedMs}`, text, 'new');
  return { ...next, comms: { ...next.comms, messages: [...next.comms.messages, report] } };
}
