import { COLS, parseSquare, ROWS, squareAt, squareId, type SquareId } from '../map/grid';
import { boostIntel } from './intel';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { treeCall } from './responses';
import { pass, search } from './sites';
import { isMissionPoint } from './mission';
import { acceptJob, declineJob } from './sidejob';
import { sendReinforcements, sendResupply } from './support';

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
};

// What the team decided about a square on its route.
export type Decision = 'blind' | 'attack' | 'push';

// Contacts for a mission script: hidden until imagery (or an intercept) finds them.
export const makeContact = (id: string, square: SquareId, label: string, strength: number, units: number[], intent?: string): Contact => ({
  id,
  square,
  label,
  strength,
  status: 'hidden',
  observed: false,
  units,
  total: units.length,
  intent,
});

// A contact on the move: it and its map marker go to a new square.
export function moveContact(s: GameState, id: string, square: SquareId): GameState {
  return {
    ...s,
    contacts: s.contacts.map((c) => (c.id === id ? { ...c, square } : c)),
    events: s.events.map((e) => (e.id === `contact-${id}` ? { ...e, square } : e)),
  };
}

// How hard it fights: its strength, scaled by the fighters it has left.
export const effectiveStrength = (c: Contact) => c.strength * (c.units.length / c.total);

export const OBSERVE_MS = 8_000;

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
      minimized: false,
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

// The team stops short of the next square on its route if nobody has imaged it, or if a
// found contact sits there that HQ hasn't decided about, and radios for a call.
export const approachSystem: System = (s) => {
  const { team } = s;
  const next = team.route[team.waypoint];
  if (!next || team.holdFor || team.fight || team.treating || s.minigame?.status === 'active') return s;
  if (squareAt(team.position.x, team.position.y) === next) return s; // already there
  const decided = team.decisions[next];
  const have = new Set(s.comms.messages.map((m) => m.id));

  const contact = contactIn(s, next);
  if (contact?.status === 'revealed' && decided !== 'attack' && decided !== 'push') {
    const id = `contact-call-${contact.id}${contact.observed ? '-observed' : ''}`;
    if (have.has(id)) return s;
    const node = contact.observed ? 'contact-observed' : 'contact';
    return holdOn(s, { node, id, square: next, label: contact.label, eventId: `contact-${contact.id}` });
  }
  if (!s.map.scanned.includes(next) && !decided) {
    const id = `unimaged-${next}-${team.waypoint}`;
    if (have.has(id)) return s;
    return holdOn(s, { node: 'unimaged', id, square: next });
  }
  return s;
};

function holdOn(s: GameState, c: { node: string; id: string; square: SquareId; label?: string; eventId?: string }): GameState {
  const m = treeCall(s, c.id, c.node, c.square, c.eventId, c.label);
  return {
    ...s,
    team: { ...s.team, holdFor: m.id, activity: `Holding short of ${c.square}` },
    comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, m] },
  };
}

// The effects HQ's answers have on a contact or an unimaged square.
export type Effect = 'observe' | 'attack' | 'avoid' | 'blind' | 'push' | 'search' | 'pass' | 'accept-job' | 'decline-job' | 'guide' | 'distract' | 'resupply' | 'reinforce';

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
      // The team watches for a while: target intel, and a look at the squares next door.
      if (!contact) return s;
      let next: GameState = {
        ...s,
        contacts: s.contacts.map((c) => (c === contact ? { ...c, observed: true } : c)),
        team: { ...s.team, holdUntilMs: s.elapsedMs + OBSERVE_MS },
      };
      next = boostIntel(next, 'target', 0.3);
      return reveal(next, neighbours(square), s.team.callsign);
    }
    case 'avoid':
      return detour(s, square);
    case 'search':
      return search(s, square);
    case 'pass':
      return pass(s, square);
    case 'guide': {
      // The fixer walks them in: the square is known ground now, and he says what's there.
      const known = { ...s, map: { ...s.map, scanned: s.map.scanned.includes(square) ? s.map.scanned : [...s.map.scanned, square] } };
      return reveal(known, [square], 'FIXER');
    }
    case 'distract':
      // Half of them chase the fixer's distraction while ALPHA goes in.
      return {
        ...s,
        contacts: s.contacts.map((c) => (c === contact ? { ...c, strength: c.strength * 0.5 } : c)),
        team: decide('attack'),
      };
    case 'resupply':
      return sendResupply(s);
    case 'reinforce':
      return sendReinforcements(s);
    case 'accept-job':
      return acceptJob(s);
    case 'decline-job':
      return declineJob(s);
  }
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
