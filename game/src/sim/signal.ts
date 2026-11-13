import { postDecoded, SIGNAL_INTEL } from './intel';
import { nextRandom } from './firefight';
import { orionScanned, reveal } from './contacts';
import type { Message } from './comms';
import type { MiniGame } from './minigame';
import type { GameState } from './state';
import type { System } from './systems';
import { lockedOn, lookAt, satelliteBusy } from './satellite';
import { parseSquare } from '../map/grid';

// Signal intercept (GDD, reworked in ILI-1169): one action with a clear goal. Their
// transmission is a wave on a frequency; HQ lays its own wave over it with one control.
// While the two match, the transcript comes through; they hop to a new frequency every
// few seconds, so HQ follows them. Enough of the message and HQ has their plan: the
// contact is marked, its route drawn, and ORION-3 can be sent to look.

export type Signal = {
  target: number; // their frequency, MHz
  dial: number; // HQ's
  nextHopMs: number; // when they hop next
  progress: number; // 0-1: how much of the message is through
  plain: string;
  contactId?: string;
};

// Getting in range (ILI-1394): a mini game never starts from a button. Enemy traffic comes up near
// a square; to listen, HQ gets an asset in range, and each way costs something, shown before HQ
// commits. ORION-3 goes there, which pulls it off scanning for ALPHA (it's tied up while it
// listens), or ALPHA stops and sets up its antenna, which burns mission clock. Once the asset is
// in place, the intercept starts by itself.
export type ListenVia = 'satellite' | 'antenna';
export type Listen = { eventId: string; square: string; via: ListenVia; readyMs: number };
// What came through, waiting on the map for HQ to send it to ALPHA (ILI-1394).
export const ANTENNA_MS = 30_000;

export const BAND = { min: 30, max: 88 }; // MHz
export const MATCH_RANGE = 6; // MHz off before the match reads 0
export const RECEIVING = 0.8; // the match it takes for words to come through
export const TRANSMISSION_MS = 20_000; // how long they talk
export const RECEIVE_MS = 11_000; // time on their frequency it takes to get every word
export const HOP_MS = 4_000;
export const HOP_MHZ = 8; // a hop lands up to this far away
export const PLAN_AT = 0.7; // enough of the message to know what they plan
export const WHERE_AT = 0.3; // enough to know where they are

const round1 = (x: number) => Math.round(x * 10) / 10;

// How well HQ's wave sits on theirs: 1 on the frequency, 0 at MATCH_RANGE off.
export const match = (g: Signal) => Math.max(0, 1 - Math.abs(g.dial - g.target) / MATCH_RANGE);

// What has come through so far.
export const transcript = (g: Signal) => g.plain.slice(0, Math.floor(g.progress * g.plain.length + 1e-9));

const WORD: Record<string, string> = { patrol: 'PATROL', checkpoint: 'CHECKPOINT', post: 'OBSERVATION POST' };

// Commit an asset to listen (ILI-1394).
export function listenWith(s: GameState, eventId: string, via: ListenVia): GameState {
  const e = s.events.find((x) => x.id === eventId && x.kind === 'signal' && x.status !== 'resolved');
  if (!e || s.minigame?.status === 'active' || s.listen) return s;
  const listen: Listen = { eventId, square: e.square, via, readyMs: via === 'antenna' ? s.elapsedMs + ANTENNA_MS : s.elapsedMs };
  if (via === 'satellite') {
    if (satelliteBusy(s)) return s;
    const moved = lookAt(s, e.square);
    return { ...moved, listen, openEvent: null };
  }
  const t = s.team;
  return { ...s, listen, openEvent: null, team: { ...t, holdUntilMs: Math.max(t.holdUntilMs, listen.readyMs), activity: `Setting up the antenna for ${e.square}` } };
}

// The asset gets in place, and the intercept starts by itself (ILI-1394). Moved off the square,
// ORION-3 drops it; the traffic gone quiet, so does the antenna.
export const listenSystem: System = (s) => {
  const l = s.listen;
  if (!l) return s;
  const e = s.events.find((x) => x.id === l.eventId && x.status !== 'resolved');
  if (!e) return { ...s, listen: null };
  if (s.minigame?.status === 'active') return s;
  if (l.via === 'satellite') {
    if (s.satellite.aim !== l.square) return { ...s, listen: null };
    if (!lockedOn(s, l.square)) return s;
  } else if (s.elapsedMs < l.readyMs) return s;
  return startIntercept({ ...s, listen: null }, l.eventId, l.via);
};

function nearest(s: GameState, square: string) {
  const at = parseSquare(square);
  if (!at) return undefined;
  const far = (sq: string) => {
    const p = parseSquare(sq);
    return p ? Math.max(Math.abs(p.col - at.col), Math.abs(p.row - at.row)) : Infinity;
  };
  return s.contacts.filter((x) => x.status === 'hidden' || x.status === 'revealed').sort((a, b) => far(a.square) - far(b.square))[0];
}

export function startIntercept(s: GameState, eventId: string, via?: ListenVia): GameState {
  const e = s.events.find((x) => x.id === eventId && x.status !== 'resolved'); // jammed or gone quiet: nothing to hear
  if (!e || s.minigame?.status === 'active') return s;
  // The traffic comes from whoever is near the signal; prefer a contact nobody has found.
  // Heard from a scan (ILI-1359), it can be a group a square or two off: then the nearest one still in the fight.
  const c = s.contacts.find((x) => x.square === e.square && x.status === 'hidden') ?? s.contacts.find((x) => x.square === e.square) ?? nearest(s, e.square);
  const [r, rng] = nextRandom(s.rng);
  const target = round1(BAND.min + 5 + r * (BAND.max - BAND.min - 10));
  // Where they are comes through only for ground ORION-3 has scanned (ILI-1493): anywhere else the
  // intercept has their words, not a fix.
  const fix = c && orionScanned(s, c.square) ? ` AT ${c.square}` : '';
  const plain = c ? `${WORD[c.id] ?? 'UNIT'}${fix} ${c.intent ?? 'HOLD POSITION'}` : `NOTHING AT ${e.square}`;
  const signal: Signal = { target, dial: round1((BAND.min + BAND.max) / 2), nextHopMs: s.elapsedMs + HOP_MS, progress: 0, plain, contactId: c?.id };
  const game: MiniGame = {
    kind: 'signal',
    square: e.square,
    eventId,
    startedMs: s.elapsedMs,
    durationMs: TRANSMISSION_MS,
    targets: [e.square],
    hits: 0,
    misses: 0,
    status: 'active',
    signal,
    via,
  };
  return { ...s, rng, openEvent: null, minigame: game };
}

const withSignal = (s: GameState, signal: Signal): GameState => ({ ...s, minigame: { ...s.minigame!, signal } });
const active = (s: GameState) => (s.minigame?.status === 'active' && s.minigame.signal ? s.minigame.signal : null);

export function tune(s: GameState, mhz: number): GameState {
  const g = active(s);
  if (!g) return s;
  return withSignal(s, { ...g, dial: round1(Math.min(BAND.max, Math.max(BAND.min, mhz))) });
}

// On their frequency the words come through; every few seconds they hop.
export const signalSystem: System = (s, dt) => {
  const g = active(s);
  if (!g) return s;
  const progress = match(g) >= RECEIVING ? Math.min(1, g.progress + dt / RECEIVE_MS) : g.progress;
  let next = { ...g, progress };
  let rng = s.rng;
  if (s.elapsedMs >= g.nextHopMs) {
    let r: number;
    [r, rng] = nextRandom(rng);
    const away = (r < 0.5 ? -1 : 1) * (3 + (r % 0.5) * 2 * (HOP_MHZ - 3));
    let target = round1(g.target + away);
    if (target < BAND.min + 2 || target > BAND.max - 2) target = round1(g.target - away);
    next = { ...next, target, nextHopMs: s.elapsedMs + HOP_MS };
  }
  const updated = { ...withSignal(s, next), rng };
  return progress >= 1 ? finishSignal(updated, 'won') : updated;
};

// When the transmission ends (or all of it is through): enough for their plan, enough for
// where they are, or nothing.
export function finishSignal(s: GameState, _status: 'won' | 'lost'): GameState {
  const m = s.minigame!;
  const g = m.signal!;
  const plan = g.progress >= PLAN_AT;
  const where = g.progress >= WHERE_AT;
  let next: GameState = { ...s, minigame: { ...m, status: plan ? 'won' : 'lost' } };
  const c = g.contactId ? next.contacts.find((x) => x.id === g.contactId) : undefined;
  const fix = !!c && orionScanned(s, c.square); // a fix on them only on scanned ground (ILI-1493)
  if (where && fix && c.status === 'hidden') next = reveal(next, [c.square], 'SIGINT');
  if (plan) {
    // What gets decoded goes on the shelf for ALPHA to pull (ILI-1499); HQ never pushes it.
    next = postDecoded({ ...next, stats: { ...next.stats, decoded: next.stats.decoded + 1 } }, fix ? c.square : m.square, c?.id, SIGNAL_INTEL);
  }
  const report: Message = {
    id: `signal-${m.startedMs}`,
    from: 'SIGINT',
    text: plan ? `Decoded: "${g.plain}". Posted for ${s.team.callsign}.` : where ? (fix ? `Got part of it: they're at ${c!.square}, but not what they plan.` : 'Got part of it: no fix on where they are, and not what they plan.') : 'Lost the signal.',
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  // Over: no after-action panel (ILI-1204); the report says what came through.
  return {
    ...next,
    minigame: null,
    events: next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...next.comms, messages: [...next.comms.messages, report] },
  };
}

// Jamming (GDD PMC mechanics): block the enemy's radios instead of listening to them. The
// enemy is slower to coordinate (the mission script decides what that means), and whatever
// the intercept would have revealed stays unknown.
export function jam(s: GameState, eventId: string): GameState {
  const e = s.events.find((x) => x.id === eventId && x.kind === 'signal' && x.status !== 'resolved');
  if (!e || s.minigame?.status === 'active') return s;
  const m: Message = {
    id: `jam-${eventId}`,
    from: 'HQ',
    text: `Jamming their net near ${e.square}. They'll be slow to coordinate, but we won't hear what they're planning.`,
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  return {
    ...s,
    flags: { ...s.flags, jammed: true },
    openEvent: null,
    events: s.events.map((x) => (x === e ? { ...x, status: 'resolved' as const } : x)),
    comms: { ...s.comms, messages: [...s.comms.messages, m] },
  };
}
