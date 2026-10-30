import type { SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { confirmKills, eyesOn, groupOrigin, unitSpot } from './imagery';
import { makeNoise, NOISE } from './noise';
import { weaponBlocked } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';

// The sniper (ILI-1253): OVERWATCH, an elite marksman, works on its own. HQ calls it on a
// square it can see, and for five seconds its crosshairs move from red dot to red dot in
// ORION-3's picture, one bolt-action round each, as many as it can get. Seven rounds for the
// whole mission. A fighter still where HQ saw it goes down; one that has moved is a miss.

export const SNIPER_CALLSIGN = 'OVERWATCH';
export const SNIPER_ROUNDS = 7; // for the mission
export const RUN_MS = 5_000; // how long it shoots for
export const FIRST_MS = 600; // onto the first target
export const BOLT_MS = 1_000; // rack and reload between shots
export const LEAVE_MS = 600; // the panel's way out, after the last shot

export type Shot = { contactId: string; unit: number; x: number; y: number; atMs: number; hit: boolean };

export type SniperRun = {
  square: SquareId;
  startedMs: number;
  endMs: number;
  rounds: number; // in the rifle when it started
  shots: Shot[]; // planned when called, each where HQ saw a fighter
  fired: number; // shots taken so far
  done: boolean;
};

export const sniperActive = (s: GameState) => !!s.sniper && !s.sniper.done;
export const sniperGone = (r: SniperRun, now: number) => r.done && now >= r.endMs + LEAVE_MS;

// The fighters HQ can see in the square, in an order that keeps the crosshairs' moves short.
function plan(s: GameState, square: SquareId, startMs: number, rounds: number): Shot[] {
  const seen: Omit<Shot, 'atMs'>[] = [];
  for (const c of s.contacts) {
    if (c.square !== square || c.status !== 'revealed') continue;
    const eyes = eyesOn(s, c);
    if (!eyes || eyes.level === 'stale') continue;
    const o = groupOrigin(c, s.elapsedMs);
    for (const unit of eyes.units) seen.push({ contactId: c.id, unit, ...unitSpot(o, unit), hit: c.units.includes(unit) });
  }
  const order: Omit<Shot, 'atMs'>[] = [];
  let at = seen.sort((a, b) => a.x - b.x)[0];
  while (at) {
    order.push(at);
    const rest = seen.filter((x) => !order.includes(x));
    at = rest.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
  }
  return order
    .map((x, i) => ({ ...x, atMs: startMs + FIRST_MS + i * BOLT_MS }))
    .filter((x, i) => i < rounds && x.atMs <= startMs + RUN_MS);
}

export function callSniper(s: GameState, contactId: string): GameState {
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c || c.status !== 'revealed' || weaponBlocked(s, 'sniper', c) || sniperActive(s)) return s;
  const rounds = s.ordnance.sniper.uses ?? SNIPER_ROUNDS;
  const shots = plan(s, c.square, s.elapsedMs, rounds);
  return {
    ...s,
    openEvent: null,
    ordnance: { ...s.ordnance, sniper: { ...s.ordnance.sniper, uses: rounds - shots.length } },
    sniper: { square: c.square, startedMs: s.elapsedMs, endMs: s.elapsedMs + RUN_MS, rounds, shots, fired: 0, done: false },
  };
}

const report = (s: GameState, r: SniperRun, text: string): Message => ({
  id: `sniper-${r.startedMs}`,
  from: SNIPER_CALLSIGN,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds: false,
});

// Each tick: the rounds whose time has come are fired (and heard); when the five seconds are up,
// OVERWATCH reports and anything it finished off is cleared.
export const sniperSystem: System = (s) => {
  const r = s.sniper;
  if (!r || r.done) return s;
  const fired = r.shots.filter((x) => x.atMs <= s.elapsedMs);
  let next = s;
  for (let i = r.fired; i < fired.length; i++) next = makeNoise(next, NOISE.sniperRound); // every round is heard
  const kills = fired.filter((x) => x.hit);
  next = {
    ...next,
    contacts: next.contacts.map((c) => {
      const down = kills.filter((k) => k.contactId === c.id).map((k) => k.unit);
      return down.length ? { ...c, units: c.units.filter((u) => !down.includes(u)) } : c;
    }),
  };
  for (const id of new Set(kills.map((k) => k.contactId))) next = confirmKills(next, id, kills.filter((k) => k.contactId === id).map((k) => k.unit));
  const run = { ...r, fired: fired.length };
  if (s.elapsedMs < r.endMs) return { ...next, sniper: run };

  // Done firing: contacts with nobody left are gone, with a kill site; the kills pay.
  const hit = new Set(kills.map((k) => k.contactId));
  const cleared = next.contacts.filter((c) => hit.has(c.id) && !c.units.length);
  for (const c of cleared) next = markSite(next, c);
  const gone = new Set(cleared.map((c) => c.id));
  next = {
    ...next,
    contacts: next.contacts.map((c) => (gone.has(c.id) ? { ...c, status: 'cleared' as const } : c)),
    events: next.events.map((e) => (e.kind === 'contact' && gone.has(e.id.replace('contact-', '')) ? { ...e, status: 'resolved' as const } : e)),
  };
  next = earn(next, kills.length * CASH_PER_STRIKE_KILL);
  const left = next.contacts.filter((c) => c.square === r.square && c.status === 'revealed').reduce((n, c) => n + c.units.length, 0);
  const pay = kills.length ? ` +$${(kills.length * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` : '';
  const text = !fired.length
    ? `${r.square}: no shot.`
    : left
      ? `${r.square}: ${kills.length} down, ${left} still in there.${pay}`
      : `${r.square}: all targets down. ${kills.length} down.${pay}`;
  return { ...next, sniper: { ...run, done: true }, comms: { ...next.comms, messages: [...next.comms.messages, report(next, r, text)] } };
};
