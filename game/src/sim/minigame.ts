import type { SquareId } from '../map/grid';
import { boostIntel } from './intel';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { spendWeapon, WEAPON, type Weapon } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';
import { makeNoise, NOISE } from './noise';
import { finishSignal, type Signal } from './signal';

// Mini games play on the theater map itself (GDD). Starting one puts the map in that game's
// mode and opens a companion panel; the result feeds back into the mission: the team gets
// what it asked for (or doesn't) and the matching intel type jumps ahead.

export type MiniGameKind = 'seekDestroy' | 'signal';
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
  // Seek and destroy only:
  weapon?: Weapon;
  contactId?: string;
  shots?: { cell: number; hit: boolean; atMs: number }[];
  roundsLeft?: number;
  nextShotMs?: number;
  spotted?: number[]; // cells the team already saw a fighter in (observe)
  // Signal intercept only:
  signal?: Signal;
};

type Def = { title: string; instructions: string };

// The satellite used to be a mini game here (tap squares in order); it's ORION-3 tasking now
// (satellite.ts).
export const MINIGAMES: Record<MiniGameKind, Def> = {
  // Seek and destroy (GDD, Battleship-style): the target's square becomes a 4x4 board and
  // its fighters hide in the cells. Fire on cells; a hit is a kill, a miss is a miss.
  seekDestroy: {
    title: 'Seek and destroy',
    instructions: 'Fire on the cells where you think they are.',
  },
  signal: {
    title: 'Signal intercept',
    instructions: 'Tune until the signal peaks and hold it there, then shift the cipher until it reads.',
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
      misses: 0,
      status: 'active',
      shots: [],
      roundsLeft: w.rounds,
      nextShotMs: s.elapsedMs,
      // Painted by ALPHA: every fighter is marked on the board. Observed only: one.
      spotted: c.painted ? [...c.units] : c.observed ? c.units.slice(0, 1) : [],
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

export const timeLeft = (s: GameState) => {
  const m = s.minigame;
  if (!m) return 0;
  return Math.max(0, m.startedMs + m.durationMs - s.elapsedMs);
};

// A tap on the map while a mini game runs: seek and destroy fires on a cell; the signal is
// played in its panel.
export function tapMiniGame(s: GameState, square: SquareId, cell?: number): GameState {
  const m = s.minigame;
  if (!m || m.status !== 'active' || m.kind !== 'seekDestroy') return s;
  return seekTap(s, square, cell);
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
  return s.minigame!.kind === 'seekDestroy' ? finishSeek(s, status) : finishSignal(s, status);
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
