import { nextRandom } from './firefight';
import { moveContact, startMove, type Contact } from './contacts';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';

// The enemy runs on rules and the mission's dice, not a script (ILI-1454): the same situation
// always plays out by the same rules, and the dice are seeded by the mission, so a mission
// replays exactly. A different seed is a different run.

// The mission's dice for one named thing: 0 to 1, the same every time for the same seed and key.
// Keyed draws don't use up the fight dice (s.rng), so a fight never changes when the patrol moves.
export function dice(seed: number, key: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return nextRandom(h)[0];
}
const between = (r: number, [lo, hi]: readonly [number, number]) => Math.round(lo + r * (hi - lo));

const live = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';

// Enemy radio traffic: every live group talks on its net now and then. Its first transmission
// comes at a random time in FIRST_TX_MS, then every TX_CALM_MS, sooner once the enemy is
// alerted (TX_ALERTED_MS). It's one net: while one transmission is up and nobody has listened
// or jammed it, the others wait for their next turn. A jammed net carries nothing.
export const FIRST_TX_MS = [50_000, 140_000] as const;
export const TX_CALM_MS = [90_000, 180_000] as const;
export const TX_ALERTED_MS = [30_000, 75_000] as const;

export const trafficOpen = (s: GameState) => s.events.some((e) => e.kind === 'signal' && e.status !== 'resolved');

export const trafficSystem: System = (s) => {
  if (!s.contacts.some((c) => live(c) && (c.nextTxMs === undefined || s.elapsedMs >= c.nextTxMs))) return s;
  let talker = null as Contact | null;
  const contacts = s.contacts.map((c) => {
    if (!live(c)) return c;
    if (c.nextTxMs === undefined) return { ...c, nextTxMs: s.elapsedMs + between(dice(s.seed, `tx-${c.id}-first`), FIRST_TX_MS) };
    if (s.elapsedMs < c.nextTxMs) return c;
    if (!talker && !s.flags.jammed && !trafficOpen(s)) talker = c;
    return { ...c, nextTxMs: s.elapsedMs + between(dice(s.seed, `tx-${c.id}-${c.nextTxMs}`), s.alerted ? TX_ALERTED_MS : TX_CALM_MS) };
  });
  const next = { ...s, contacts };
  return talker ? transmit(next, talker) : next;
};

// Traffic comes up on the map at the group's square, and HQ hears it.
function transmit(s: GameState, c: Contact): GameState {
  const id = `traffic-${c.square.toLowerCase()}-${s.elapsedMs}`;
  const m: Message = { id: `hq-${id}`, from: 'HQ', text: `Picking up enemy radio traffic near ${c.square}. Listen in?`, atMs: s.elapsedMs, status: 'new', holds: false, alert: true };
  return {
    ...s,
    events: [...s.events, { id, kind: 'signal', square: c.square, title: 'Enemy radio traffic', atMs: s.elapsedMs, status: 'new' }],
    comms: { ...s.comms, messages: [...s.comms.messages, m] },
  };
}

// A group with a plan (planTo: the patrol hunting the drone) carries it out. When it sets off is
// the dice: some time in PLAN_DEPART_MS. Alerted, it hurries (PLAN_ALERTED of that); its net
// jammed, it's slow to coordinate (PLAN_JAMMED_MS later). It walks PLAN_WALK_MS to get there.
// Dead, already there, or too late (ALPHA has the black box), it goes nowhere.
export const PLAN_DEPART_MS = [170_000, 230_000] as const;
export const PLAN_ALERTED = 0.6;
export const PLAN_JAMMED_MS = 150_000;
export const PLAN_WALK_MS = 50_000;

export const planDepartMs = (s: GameState, c: Contact) =>
  Math.round(between(dice(s.seed, `plan-${c.id}`), PLAN_DEPART_MS) * (s.alerted ? PLAN_ALERTED : 1)) + (s.flags.jammed ? PLAN_JAMMED_MS : 0);
// When it gets there: on its way, when it's due; not yet, its departure plus the walk.
export const planArriveMs = (s: GameState, c: Contact) => c.move?.arriveMs ?? planDepartMs(s, c) + PLAN_WALK_MS;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const article = (t: string) => t.replace(/^(a|an|the) /, '');

export const planSystem: System = (s) => {
  if (s.mission.blackBox) return s;
  let next = s;
  for (const c of s.contacts) {
    if (!live(c) || !c.planTo || c.square === c.planTo) continue;
    if (!c.move && s.elapsedMs >= planDepartMs(s, c)) next = startMove(next, c.id, c.planTo, s.elapsedMs + PLAN_WALK_MS);
    else if (c.move && s.elapsedMs >= c.move.arriveMs) next = arrive(next, c, c.planTo);
  }
  return next;
};

// It gets there. HQ only knows if someone found it: then the marker goes with it and HQ calls it;
// otherwise it's a surprise for whoever walks in.
function arrive(s: GameState, c: Contact, to: string): GameState {
  const moved = moveContact(s, c.id, to);
  if (c.status !== 'revealed') return moved;
  const where = to === s.mission.b ? `the crash site in ${to}` : to;
  const m: Message = {
    id: `${c.id}-arrived`,
    from: 'HQ',
    text: `${cap(article(c.label))} moving onto ${where}: nobody stopped it. Hit it before ALPHA gets there.`,
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
    alert: true,
  };
  return {
    ...moved,
    events: moved.events.map((e) => (e.id === `contact-${c.id}` ? { ...e, square: to } : e)),
    comms: { ...moved.comms, messages: [...moved.comms.messages, m] },
  };
}
