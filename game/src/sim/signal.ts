import { nextRandom } from './firefight';
import { boostIntel } from './intel';
import { reveal } from './contacts';
import type { Message } from './comms';
import type { MiniGame } from './minigame';
import type { GameState } from './state';
import type { System } from './systems';

// Signal intercept (GDD): when enemy radio traffic comes up, tune to its frequency and
// decode it against a timer. Tuning: move the dial until the signal peaks and hold it there
// to lock on. Decoding: shift the cipher until the intercept reads as plain words. A decode
// tells HQ where the enemy is (the contact is marked on the map) and feeds signals intel.

export type Signal = {
  phase: 'tune' | 'decode';
  target: number; // MHz
  dial: number;
  lockMs: number; // time held inside the band
  plain: string;
  shift: number; // the cipher's shift
  guess: number; // HQ's current shift
  contactId?: string;
};

export const BAND = { min: 30, max: 88 }; // MHz
export const LOCK_WITHIN = 0.3; // MHz either side
export const LOCK_HOLD_MS = 1_500;
export const INTERCEPT_MS = 30_000;
export const WRONG_DECODE_MS = 3_000;

const round1 = (x: number) => Math.round(x * 10) / 10;

// How strong the signal is at the dial: 1 on the frequency, falling to 0 six MHz off.
export const strength = (g: Signal) => Math.max(0, 1 - Math.abs(g.dial - g.target) / 6);

const caesar = (text: string, k: number) =>
  text.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + ((k % 26) + 26)) % 26) + 65));

// What HQ sees right now: the intercept shifted by however far the guess is off.
export const cipherText = (g: Signal) => caesar(g.plain, g.shift - g.guess);

const WORD: Record<string, string> = { patrol: 'PATROL', technicals: 'TECHNICALS', post: 'OBSERVATION POST' };

export function startIntercept(s: GameState, eventId: string): GameState {
  const e = s.events.find((x) => x.id === eventId);
  if (!e || s.minigame?.status === 'active') return s;
  // The traffic comes from whoever is near the signal; prefer a contact nobody has found.
  const c = s.contacts.find((x) => x.square === e.square && x.status === 'hidden') ?? s.contacts.find((x) => x.square === e.square);
  let rng = s.rng;
  let r: number;
  [r, rng] = nextRandom(rng);
  const target = round1(BAND.min + 5 + r * (BAND.max - BAND.min - 10));
  [r, rng] = nextRandom(rng);
  const shift = 3 + Math.floor(r * 20);
  const plain = c ? `${WORD[c.id] ?? 'UNIT'} AT ${c.square} HOLD POSITION` : `NOTHING AT ${e.square}`;
  const signal: Signal = { phase: 'tune', target, dial: round1((BAND.min + BAND.max) / 2), lockMs: 0, plain, shift, guess: 0, contactId: c?.id };
  const game: MiniGame = {
    kind: 'signal',
    square: e.square,
    eventId,
    startedMs: s.elapsedMs,
    durationMs: INTERCEPT_MS,
    targets: [e.square],
    hits: 0,
    hitAt: [],
    misses: 0,
    status: 'active',
    signal,
  };
  return { ...s, rng, openEvent: null, minigame: game };
}

const withSignal = (s: GameState, signal: Signal): GameState => ({ ...s, minigame: { ...s.minigame!, signal } });
const active = (s: GameState) => (s.minigame?.status === 'active' && s.minigame.signal ? s.minigame.signal : null);

export function tune(s: GameState, mhz: number): GameState {
  const g = active(s);
  if (!g || g.phase !== 'tune') return s;
  return withSignal(s, { ...g, dial: round1(Math.min(BAND.max, Math.max(BAND.min, mhz))) });
}

export function shiftGuess(s: GameState, delta: number): GameState {
  const g = active(s);
  if (!g || g.phase !== 'decode') return s;
  return withSignal(s, { ...g, guess: (((g.guess + delta) % 26) + 26) % 26 });
}

// Send the decode: right, and the intel goes out; wrong, and it costs time.
export function submitDecode(s: GameState): GameState {
  const g = active(s);
  if (!g || g.phase !== 'decode') return s;
  if (cipherText(g) === g.plain) return finishSignal(s, 'won');
  return { ...s, minigame: { ...s.minigame!, misses: s.minigame!.misses + 1, durationMs: s.minigame!.durationMs - WRONG_DECODE_MS } };
}

// Holding the dial in the band for long enough locks on and moves to decoding.
export const signalSystem: System = (s, dt) => {
  const g = active(s);
  if (!g || g.phase !== 'tune') return s;
  const inBand = Math.abs(g.dial - g.target) <= LOCK_WITHIN + 1e-9;
  const lockMs = inBand ? g.lockMs + dt : 0;
  return withSignal(s, lockMs >= LOCK_HOLD_MS ? { ...g, lockMs, phase: 'decode' } : { ...g, lockMs });
};

export function finishSignal(s: GameState, status: 'won' | 'lost'): GameState {
  const m = s.minigame!;
  const g = m.signal!;
  let next: GameState = { ...s, minigame: { ...m, status } };
  if (status === 'won') {
    next = boostIntel({ ...next, stats: { ...next.stats, decoded: next.stats.decoded + 1 } }, 'signals', 0.3);
    const c = g.contactId && next.contacts.find((x) => x.id === g.contactId);
    if (c && c.status === 'hidden') next = reveal(next, [c.square], 'SIGINT');
  }
  const report: Message = {
    id: `signal-${m.startedMs}`,
    from: 'SIGINT',
    text: status === 'won' ? `Decoded: "${g.plain}".` : g.phase === 'tune' ? 'Lost the signal.' : 'Could not break it in time.',
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  return {
    ...next,
    events: next.events.map((e) => (e.id === m.eventId ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...next.comms, messages: [...next.comms.messages, report] },
  };
}
