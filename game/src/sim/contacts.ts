import { COLS, parseSquare, ROWS, squareAt, squareId, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { pass } from './sites';
import { isMissionPoint } from './mission';
import { sendResupply } from './support';
import { nextRandom } from './firefight';
import { missionDef } from './script';
import { LOADOUT } from './team';

// Contacts hide on the map until imagery finds them (GDD grid scan outcomes, and the War
// Room prototype's loop). The team stops short of any square nobody has imaged and asks
// for a scan; a found contact on the route makes it ask HQ to observe, attack or avoid.
// Walking into a contact nobody found is an ambush.

export type ContactStatus = 'hidden' | 'revealed' | 'cleared' | 'avoided';
// units: the cells (0-15, a 4x4 board over the square, row by row) where its fighters
// are; seek and destroy shoots at them. strength scales with how many are left.
export type Contact = {
  id: string;
  square: SquareId;
  label: string;
  strength: number;
  status: ContactStatus;
  observed: boolean;
  units: number[];
  total: number;
  intent?: string; // what an intercept of its radio reveals it's doing
  painted?: boolean; // ALPHA has a laser on it: strikes see every fighter
  note?: string; // what HQ knows about it, shown in its target menu
  move?: { from: SquareId; to: SquareId; fromMs: number; arriveMs: number }; // on its way to another square
  planTo?: SquareId; // where its plan takes it (what an intercept reveals)
  planKnown?: boolean; // HQ decoded its plan: its route shows on the map
};

// What the team decided about a square on its route.
export type Decision = 'blind' | 'attack' | 'push';

// Contacts for a mission script: hidden until imagery (or an intercept) finds them.
export const makeContact = (id: string, square: SquareId, label: string, strength: number, units: number[], intent?: string, planTo?: SquareId): Contact => ({
  id,
  square,
  label,
  strength,
  status: 'hidden',
  observed: false,
  units,
  total: units.length,
  intent,
  planTo,
});

// A contact sets off for another square, arriving at arriveMs (moveContact puts it there).
export function startMove(s: GameState, id: string, to: SquareId, arriveMs: number): GameState {
  return { ...s, contacts: s.contacts.map((c) => (c.id === id ? { ...c, move: { from: c.square, to, fromMs: s.elapsedMs, arriveMs } } : c)) };
}

// A contact arrives in a new square. Its map marker stays where it was last seen: the map
// only moves it when someone looks (imagery.record).
export function moveContact(s: GameState, id: string, square: SquareId): GameState {
  return { ...s, contacts: s.contacts.map((c) => (c.id === id ? { ...c, square, move: undefined } : c)) };
}

// How hard it fights: its strength, scaled by the fighters it has left.
export const effectiveStrength = (c: Contact) => c.strength * (c.units.length / c.total);

export const OBSERVE_MS = 13_000;

const live = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';
export const contactIn = (s: GameState, sq: SquareId) => s.contacts.find((c) => c.square === sq && live(c));

const radio = (s: GameState, from: string, id: string, text: string, holds = false, extra: Partial<Message> = {}): Message => ({
  id,
  from,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds,
  ...extra,
});

// Imagery of these squares reaches the team: hidden contacts in them are found and marked.
export function reveal(s: GameState, squares: SquareId[], by: string): GameState {
  const found = s.contacts.filter((c) => c.status === 'hidden' && squares.includes(c.square));
  if (!found.length) return s;
  const ids = new Set(found.map((c) => c.id));
  const ahead = s.team.route.slice(s.team.waypoint);
  return {
    ...s,
    contacts: s.contacts.map((c) => (ids.has(c.id) ? { ...c, status: 'revealed' as const } : c)),
    events: [
      ...s.events,
      ...found.map((c) => ({ id: `contact-${c.id}`, kind: 'contact' as const, square: c.square, title: cap(c.label), atMs: s.elapsedMs, status: 'new' as const })),
    ],
    comms: {
      ...s.comms,
      messages: [
        ...s.comms.messages,
        ...found.map((c) =>
          radio(s, by, `found-${c.id}`, `Contact in ${c.square}: ${c.label}.${ahead.includes(c.square) ? ' It is on ALPHA’s route.' : ''}`),
        ),
      ],
    },
  };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ALPHA decides for itself (ILI-1315, decision logic ILI-1312). It doesn't ask HQ what to do:
// HQ changes the ground (scans, strikes, intel), ALPHA reads it and radios what it's doing.
// A contact HQ has found on the square it's heading into gets weighed: take it, hold short for
// HQ to soften it (twenty seconds, then go around), or go around. A square nobody imaged it
// just walks into if the intel gauge lets it (intel.ts), and finds out (ILI-1309). The exfil
// always has a way out: a fight ALPHA won't take there sends it to the alternate exfil.
export const TAKE_AT = 0.6; // their strength over ours at or under this: take the fight
export const AVOID_ABOVE = 1; // over this: go around; between the two: soften it first
export const SOFTEN_MS = 20_000;

// Their strength over ALPHA's: fighters weighted by how hard they are, against operators
// still up, weighted by the ammo they've got left, halved when the meds are gone.
export function odds(s: GameState, c: Contact): number {
  const up = s.team.operators.filter((o) => o.health > 0);
  if (!up.length) return Infinity;
  const ammo = up.reduce((n, o) => n + Math.min(1, o.ammo / LOADOUT[o.role].ammo), 0) / up.length;
  const meds = up.some((o) => o.meds > 0) ? 1 : 0.5;
  return (c.units.length * c.strength) / (up.length * ammo * meds);
}

export const approachSystem: System = (s) => {
  const { team } = s;
  const next = team.route[team.waypoint];
  if (!next || team.holdFor || team.fight || team.treating || s.minigame?.status === 'active') return s;
  if (squareAt(team.position.x, team.position.y) === next) return s; // already there
  const contact = contactIn(s, next);
  if (contact?.status === 'revealed' && team.decisions[next] !== 'attack') return assess(s, next, contact);
  // Held short of a contact that HQ's support has since wiped out: it moves through.
  if (team.waitFor?.square === next && !contact)
    return decideOn(say(s, `clear-${next}-${s.elapsedMs}`, `Targets in ${next} are down. Moving through.`), next, 'push');
  return s;
};

function assess(s: GameState, square: SquareId, c: Contact): GameState {
  const r = odds(s, c);
  const waiting = s.team.waitFor?.square === square ? s.team.waitFor : null;
  const what = `Contact in ${square}, ${c.label}.`;
  if (r <= TAKE_AT) return decideOn(say(s, `take-${c.id}-${s.elapsedMs}`, waiting ? `That did it. Moving in on ${square}.` : `${what} We'll take them.`), square, 'attack');
  if (r <= AVOID_ABOVE) {
    if (!waiting) return say({ ...s, team: { ...s.team, waitFor: { square, untilMs: s.elapsedMs + SOFTEN_MS } } }, `soften-${c.id}-${s.elapsedMs}`, `${what} Too many to walk into. Soften them up and we'll go.`);
    if (s.elapsedMs < waiting.untilMs) return s;
    return goAround(s, square, `No change in ${square}.`);
  }
  return goAround(s, square, `${what} Not taking that.`);
}

// It won't take the fight: around it, or out by the alternate exfil. The crash site it can't
// skip: it goes in.
function goAround(s: GameState, square: SquareId, why: string): GameState {
  const cleared = { ...s, team: { ...s.team, waitFor: null } };
  if (square === s.mission.c) {
    const next = divertExfil(cleared, square);
    if (next.mission.c !== square) return say(next, `divert-${s.elapsedMs}`, `${why} Swinging wide to the alternate exfil at ${next.mission.c}.`);
  }
  if (isMissionPoint(s, square)) return decideOn(say(cleared, `go-${s.elapsedMs}`, `${why} It's the crash site: we're going in.`), square, 'attack');
  const i = s.team.route.indexOf(square, s.team.waypoint);
  // Only ALPHA's route changes: the contact stays where it is, live, for HQ to hit if it likes.
  const next = { ...detour(cleared, square), contacts: cleared.contacts, events: cleared.events };
  const via = next.team.route[i];
  return via && via !== square ? say(next, `around-${s.elapsedMs}`, `${why} Going around via ${via}.`) : decideOn(say(cleared, `through-${s.elapsedMs}`, `${why} No way around: going through.`), square, 'attack');
}

const decideOn = (s: GameState, square: SquareId, d: Decision): GameState => ({ ...s, team: { ...s.team, waitFor: null, decisions: { ...s.team.decisions, [square]: d } } });

// What ALPHA tells HQ: its decision, not a question.
const say = (s: GameState, id: string, text: string): GameState => ({ ...s, comms: { ...s.comms, messages: [...s.comms.messages, radio(s, s.team.callsign, id, text)] } });

// Moving in blind pays out where the player can see it (ILI-1309): the moment ALPHA reaches a
// square nobody had imaged, the square is known ground, and the map stamps what it found
// there, clear or contact (MapScene). On the instruments, not over the radio.
export const blindSystem: System = (s) => {
  const here = squareAt(s.team.position.x, s.team.position.y);
  if (!here || s.map.scanned.includes(here) || s.map.blind.some((b) => b.square === here)) return s;
  const found = !!contactIn(s, here);
  return {
    ...s,
    map: { ...s.map, scanned: [...new Set([...s.map.scanned, here])], blind: [...s.map.blind, { square: here, atMs: s.elapsedMs, found }] },
  };
};

// The effects HQ's answers have on a contact or an unimaged square.
export type Effect = 'observe' | 'attack' | 'avoid' | 'blind' | 'push' | 'pass' | 'resupply' | 'divert';

export function applyEffect(s: GameState, effect: Effect, square: SquareId): GameState {
  const decide = (d: Decision) => ({ ...s.team, decisions: { ...s.team.decisions, [square]: d } });
  const contact = contactIn(s, square);
  switch (effect) {
    case 'blind':
      return { ...s, team: decide('blind') };
    case 'push':
    case 'attack':
      return { ...s, team: decide(effect) };
    case 'observe': {
      // The team watches for a while and paints the target for the war room: a look at the
      // squares next door, and a laser on every fighter.
      if (!contact) return s;
      const next: GameState = {
        ...s,
        contacts: s.contacts.map((c) => (c === contact ? { ...c, observed: true, painted: true } : c)),
        team: { ...s.team, holdUntilMs: s.elapsedMs + OBSERVE_MS },
      };
      return reveal(next, neighbours(square), s.team.callsign);
    }
    case 'avoid':
      return detour(s, square);
    case 'pass':
      return pass(s, square);
    case 'resupply':
      return sendResupply(s);
    case 'divert':
      return divertExfil(s, square);
  }
}

// Move exfil away from a cut one (ILI-1192): the mission's alternate exfil, by its own
// route, and the cut square comes off ALPHA's route.
export function divertExfil(s: GameState, cut: SquareId): GameState {
  const alt = missionDef(s.script.mission)?.altExfil;
  const { route, waypoint } = s.team;
  const i = route.indexOf(cut, waypoint);
  if (!alt || i < 0) return s;
  return {
    ...s,
    mission: { ...s.mission, c: alt.at(-1)! },
    team: { ...s.team, route: [...route.slice(0, i), ...alt] },
  };
}

// Go around a square: swap it in the route for a neighbour that touches the squares before
// and after it and has no known contact. The detour square may need imagery of its own.
export function detour(s: GameState, square: SquareId): GameState {
  const { route, waypoint } = s.team;
  const i = route.indexOf(square, waypoint);
  if (i < 0) return s;
  if (isMissionPoint(s, square)) return applyEffect(s, 'push', square); // the crash site and exfil can't be skipped
  const prev = i > 0 ? route[i - 1] : squareAt(s.team.position.x, s.team.position.y);
  const after = route[i + 1];
  const touches = (a: SquareId, b?: SquareId | null) => {
    if (!b) return true;
    const p = parseSquare(a)!;
    const q = parseSquare(b)!;
    return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row)) <= 1;
  };
  const known = (sq: SquareId) => s.contacts.some((c) => c.square === sq && c.status === 'revealed');
  const options = neighbours(square).filter((n) => !route.includes(n) && touches(n, prev) && touches(n, after) && !known(n));
  const via = options.find((n) => s.map.scanned.includes(n)) ?? options[0];
  if (!via) return applyEffect(s, 'push', square); // nowhere to go: they go through
  const contact = contactIn(s, square);
  return {
    ...s,
    team: { ...s.team, route: [...route.slice(0, i), via, ...route.slice(i + 1)] },
    contacts: contact ? s.contacts.map((c) => (c === contact ? { ...c, status: 'avoided' as const } : c)) : s.contacts,
    events: contact ? s.events.map((e) => (e.id === `contact-${contact.id}` ? { ...e, status: 'resolved' as const } : e)) : s.events,
  };
}

export function neighbours(sq: SquareId): SquareId[] {
  const { col, row } = parseSquare(sq)!;
  const out: SquareId[] = [];
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]])
    if (col + dc >= 0 && col + dc < COLS && row + dr >= 0 && row + dr < ROWS) out.push(squareId(col + dc, row + dr));
  return out;
}

// Fighters don't stand still (ILI-1168): every DRIFT_MS one fighter in each group moves to
// a cell next to it, so an old look slowly stops matching. Chance comes from the tick, not
// the mission's dice, so fights replay the same.
export const DRIFT_MS = 33_000;
const CELLS = 4;
const roll = (seed: number) => nextRandom(seed >>> 0)[0];

const nextTo = (cell: number) => {
  const r = Math.floor(cell / CELLS);
  const c = cell % CELLS;
  const out: number[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (r + dr >= 0 && r + dr < CELLS && c + dc >= 0 && c + dc < CELLS) out.push((r + dr) * CELLS + c + dc);
  }
  return out;
};

export const driftSystem: System = (s) => {
  if (s.tick % (DRIFT_MS / 100) !== 0) return s;
  let moved = false;
  const contacts = s.contacts.map((c, i) => {
    if (!live(c) || !c.units.length || c.move || s.team.fight?.square === c.square) return c;
    const from = c.units[Math.floor(roll(s.tick * 7919 + i) * c.units.length)];
    const options = nextTo(from).filter((x) => !c.units.includes(x));
    if (!options.length) return c;
    moved = true;
    const to = options[Math.floor(roll(s.tick * 104729 + i) * options.length)];
    return { ...c, units: c.units.map((u) => (u === from ? to : u)) };
  });
  return moved ? { ...s, contacts } : s;
};
