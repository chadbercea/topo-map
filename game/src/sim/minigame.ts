import type { SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { spendWeapon, WEAPON, type Weapon } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';
import { makeNoise, NOISE } from './noise';
import { finishSignal, type Signal } from './signal';
import { scatter } from './contacts';
import { confirmKills, eyesOn, type Freshness } from './imagery';

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
  spotted?: number[]; // cells HQ saw fighters in when it fired (from the newest look)
  eyes?: Freshness | null; // how good that look was; live follows them as they move
  confirmed?: number; // kills HQ saw: the ones that pay
  scattered?: boolean; // the first shot sent them to cover
  // Listen (signal intercept) only:
  signal?: Signal;
};

type Def = { title: string; instructions: string };

// The satellite used to be a mini game here (tap squares in order); it's ORION-3 tasking now
// (satellite.ts).
export const MINIGAMES: Record<MiniGameKind, Def> = {
  // Strike (ILI-1168): the target's square opens with every fighter HQ has seen in it, at
  // the positions it saw them. Fresh eyes mean clean shots; old ones are guesses.
  seekDestroy: {
    title: 'Strike',
    instructions: 'Fire at the fighters you can see.',
  },
  signal: {
    title: 'Listen',
    instructions: 'Drag to lay your line over theirs and keep it there. They hop every few seconds: follow them.',
  },
};

export const BOARD = 4; // cells per side
const CALLSIGN: Record<Weapon, string> = { drone: 'REAPER-1', sniper: 'OVERWATCH', heli: 'HAMMER-2' };

// Fire a weapon at a found contact: the map turns into its board.
export function startSeek(s: GameState, contactId: string, weapon: Weapon): GameState {
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c || c.status !== 'revealed') return s;
  const w = WEAPON[weapon];
  const eyes = eyesOn(s, c);
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
      spotted: eyes ? [...eyes.units] : [],
      eyes: eyes?.level ?? null,
    },
  };
}

// Where a round lands: the drone's blast covers the cell tapped and the ones right and
// below it; the heli strafes the whole row; the sniper hits one cell.
const blast = (cell: number) => {
  const r = Math.floor(cell / BOARD);
  const c = cell % BOARD;
  const out = [cell];
  if (c + 1 < BOARD) out.push(cell + 1);
  if (r + 1 < BOARD) out.push(cell + BOARD);
  if (c + 1 < BOARD && r + 1 < BOARD) out.push(cell + BOARD + 1);
  return out;
};

const strafe = (cell: number) => {
  const r = Math.floor(cell / BOARD) * BOARD;
  return [r, r + 1, r + 2, r + 3];
};

function seekTap(s: GameState, square: SquareId, cell: number | undefined): GameState {
  const m = s.minigame!;
  if (square !== m.square || cell === undefined || !m.roundsLeft || s.elapsedMs < (m.nextShotMs ?? 0)) return s;
  const c = s.contacts.find((x) => x.id === m.contactId)!;
  const cells = m.weapon === 'drone' ? blast(cell) : m.weapon === 'heli' ? strafe(cell) : [cell];
  const kills = c.units.filter((u) => cells.includes(u));
  // Kills HQ watched happen are confirmed: they pay, and come off its picture. A blind
  // strike's kills are only found later.
  const seen = !!m.eyes && m.eyes !== 'stale';
  const shots = [...(m.shots ?? []), ...cells.map((x) => ({ cell: x, hit: kills.includes(x), atMs: s.elapsedMs }))];
  // The first shot is heard: whoever is left scatters to cover.
  const hit = { ...c, units: c.units.filter((u) => !kills.includes(u)) };
  const after = m.scattered || !hit.units.length ? hit : scatter(hit, s.elapsedMs + cell);
  const units = after.units;
  const loud = m.weapon === 'drone' ? NOISE.drone : m.weapon === 'heli' ? NOISE.heli / WEAPON.heli.rounds : NOISE.sniperRound;
  const next: GameState = {
    ...makeNoise(seen ? confirmKills(earn(s, kills.length * CASH_PER_STRIKE_KILL), c.id, kills) : s, loud), // every shot is heard
    contacts: s.contacts.map((x) => (x === c ? { ...x, units } : x)),
    minigame: {
      ...m,
      shots,
      hits: m.hits + kills.length,
      misses: m.misses + (kills.length ? 0 : 1),
      roundsLeft: m.roundsLeft - 1,
      nextShotMs: s.elapsedMs + WEAPON[m.weapon!].cycleMs,
      scattered: true,
      spotted: seen ? (m.spotted ?? []).filter((u) => !kills.includes(u)) : m.spotted,
      confirmed: (m.confirmed ?? 0) + (seen ? kills.length : 0),
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
    next = {
      ...next,
      contacts: next.contacts.map((x) => (x.id === c.id ? { ...x, status: 'cleared' as const } : x)),
      events: next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)),
    };
    next = markSite(next, c);
  }
  const confirmed = m.confirmed ?? 0;
  const pay = confirmed ? ` +$${(confirmed * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` : m.hits ? ' Unconfirmed: no eyes on it.' : '';
  const text = status === 'won' ? `${m.square}: target destroyed. ${m.hits} down.${pay}` : `${m.square}: ${m.hits} down, ${left} still in there.${pay}`;
  const report = radio(s, CALLSIGN[m.weapon!], `seek-${m.startedMs}`, text, 'new');
  return { ...next, comms: { ...next.comms, messages: [...next.comms.messages, report] } };
}
