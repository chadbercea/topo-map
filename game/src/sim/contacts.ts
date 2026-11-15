import { COLS, parseSquare, ROWS, squareAt, squareId, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { pass } from './sites';
import { isMissionPoint } from './mission';
import { sendResupply } from './support';
import { missionDef } from './script';
import { LOADOUT } from './team';
import { knownTo } from './picture';
import { nextRandom } from './firefight';
import { stale } from './intel';

// Contacts hide on the map until imagery finds them (GDD grid scan outcomes, and the War
// Room prototype's loop). The team stops short of any square nobody has imaged and asks
// for a scan; a found contact on the route makes it ask HQ to observe, attack or avoid.
// Walking into a contact ALPHA didn't know of is an ambush (firefight.ts, ILI-1496).

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
  note?: string; // what HQ knows about it, a one- or two-word tag in its target menu (ILI-1525)
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
// only moves it when someone looks (imagery.record). HQ's intel on both squares goes stale, the
// one it left and the one it walked into (ILI-1559: intel is good until the group moves), so ALPHA
// holds short of a square HQ had cleared and asks for a fresh look; ALPHA still goes by what it was told.
// A square someone is watching (ORION-3 over it, or a live feed) sees them walk in instead.
export function moveContact(s: GameState, id: string, square: SquareId): GameState {
  const from = s.contacts.find((c) => c.id === id)?.square;
  let next: GameState = { ...s, contacts: s.contacts.map((c) => (c.id === id ? { ...c, square, move: undefined } : c)) };
  if (!from || from === square) return next;
  const watched = (!s.minigame && s.satellite.aim === square) || (s.intel.live ?? []).includes(square);
  for (const sq of watched ? [from] : [from, square]) if (next.intel.graded.includes(sq)) next = stale(next, sq);
  return next;
}

// How hard it fights: its strength, scaled by the fighters it has left.
export const effectiveStrength = (c: Contact) => c.strength * (c.units.length / c.total);

export const OBSERVE_MS = 13_000;

const live = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';
export const contactIn = (s: GameState, sq: SquareId) => s.contacts.find((c) => c.square === sq && live(c));

// Nothing about an enemy shows until ORION-3 has scanned the square it's in (ILI-1493). A scanned
// square is one ORION-3's analysts have been through (intel.ts settled). The one exception is
// ALPHA's own recon: a square it's in contact on, it reports itself.
export const orionScanned = (s: GameState, sq: SquareId) => s.intel.graded.includes(sq);

// Where HQ knows a found contact is (ILI-1493): where the last look put it, its map marker, or else
// the newest picture that caught it. Never where it really is: it may have walked off since.
export function knownSquare(s: GameState, c: Contact): SquareId | null {
  if (c.status !== 'revealed') return null;
  const e = s.events.find((x) => x.id === `contact-${c.id}` && x.status !== 'resolved');
  if (e) return e.square;
  let best: { square: SquareId; atMs: number } | null = null;
  for (const snap of Object.values(s.imagery)) if (snap.seen.some((x) => x.contactId === c.id) && (!best || snap.atMs > best.atMs)) best = snap;
  return best?.square ?? null;
}
// The found contacts HQ has in a square.
export const knownIn = (s: GameState, sq: SquareId) => s.contacts.filter((c) => knownSquare(s, c) === sq);

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
export function reveal(s: GameState, squares: SquareId[]): GameState {
  const found = s.contacts.filter((c) => c.status === 'hidden' && squares.includes(c.square));
  if (!found.length) return s;
  const ids = new Set(found.map((c) => c.id));
  // No radio line (comms standard): the map and the flyout show what was found.
  return {
    ...s,
    contacts: s.contacts.map((c) => (ids.has(c.id) ? { ...c, status: 'revealed' as const } : c)),
    events: [
      ...s.events,
      ...found.map((c) => ({ id: `contact-${c.id}`, kind: 'contact' as const, square: c.square, title: cap(c.label), atMs: s.elapsedMs, status: 'new' as const })),
    ],
  };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ALPHA decides for itself (ILI-1315, decision logic ILI-1312). It doesn't ask HQ what to do:
// HQ changes the ground (scans, strikes, intel), ALPHA reads it and radios what it's doing.
// A contact ALPHA knows of (picture.ts) on the square it's heading into gets weighed: take it, hold short for
// HQ to soften it (for as long as it takes: no timer, ILI-1551), or go around. A square nobody imaged it
// only enters on fresh intel (movement.ts, ILI-1532). The exfil
// always has a way out: a fight ALPHA won't take there sends it to the alternate exfil.
export const TAKE_AT = 0.6; // their strength over ours at or under this: take the fight
export const AVOID_ABOVE = 1; // over this: go around; between the two: soften it first

// Their strength over ALPHA's: fighters weighted by how hard they are, against operators
// still up, weighted by the ammo they've got left, halved when the meds are gone. units: how many
// fighters ALPHA was told about (ILI-1495), the group's own count if not given.
export function odds(s: GameState, c: Contact, units = c.units.length): number {
  const up = s.team.operators.filter((o) => o.health > 0);
  if (!up.length) return Infinity;
  const ammo = up.reduce((n, o) => n + Math.min(1, o.ammo / LOADOUT[o.role].ammo), 0) / up.length;
  const meds = up.some((o) => o.meds > 0) ? 1 : 0.5;
  return (units * c.strength) / (up.length * ammo * meds);
}

export const approachSystem: System = (s) => {
  const { team } = s;
  const next = team.route[team.waypoint];
  if (!next || team.holdFor || team.fight || team.treating) return s; // it decides during the mini game too (ILI-1552)
  if (squareAt(team.position.x, team.position.y) === next) return s; // already there
  // Only what ALPHA knows (ILI-1495): intel HQ sent it, or its own eyes. Never the ground truth.
  const known = knownTo(s, next);
  if (known && team.decisions[next] !== 'attack') return assess(s, next, known.c, known.units);
  // Held short of a contact that HQ's support has since wiped out: it moves through.
  if (team.waitFor?.square === next && !known)
    return decideOn(say(s, `clear-${next}-${s.elapsedMs}`, `${next} clear, moving through.`), next, 'push');
  return s;
};

function assess(s: GameState, square: SquareId, c: Contact, units: number): GameState {
  const r = odds(s, c, units);
  const waiting = s.team.waitFor?.square === square ? s.team.waitFor : null;
  const what = `CONTACT ${square}, ${c.label}.`;
  if (r <= TAKE_AT) return decideOn(say(s, `take-${c.id}-${s.elapsedMs}`, waiting ? `moving in on ${square}.` : `${what} Moving to engage.`), square, 'attack');
  if (r <= AVOID_ABOVE) {
    if (!waiting) return say({ ...s, team: { ...s.team, waitFor: { square } } }, `soften-${c.id}-${s.elapsedMs}`, `${what} Too strong to take. Holding short, request fires on ${square}.`);
    return s; // it holds until HQ changes the ground (ILI-1551)
  }
  return goAround(s, square, `${what} Too strong to take.`);
}

// It won't take the fight: around it, or out by the alternate exfil. The crash site it can't
// skip: it goes in.
function goAround(s: GameState, square: SquareId, why: string): GameState {
  const cleared = { ...s, team: { ...s.team, waitFor: null } };
  if (square === s.mission.c) {
    const next = divertExfil(cleared, square);
    if (next.mission.c !== square) return say(next, `divert-${s.elapsedMs}`, `${why} Moving to the alternate exfil at ${next.mission.c}.`);
  }
  // The crash site, or the exfil with no alternate left: ALPHA names the place it can't skip.
  if (isMissionPoint(s, square)) return decideOn(say(cleared, `go-${s.elapsedMs}`, `${why} ${square === s.mission.b ? 'Crash site' : 'Exfil'}, no way around. Moving to engage.`), square, 'attack');
  const i = s.team.route.indexOf(square, s.team.waypoint);
  // Only ALPHA's route changes: the contact stays where it is, live, for HQ to hit if it likes.
  const next = { ...detour(cleared, square), contacts: cleared.contacts, events: cleared.events };
  const via = next.team.route[i];
  return via && via !== square ? say(next, `around-${s.elapsedMs}`, `${why} Moving around via ${via}.`) : decideOn(say(cleared, `through-${s.elapsedMs}`, `${why} No way around. Moving to engage.`), square, 'attack');
}

const decideOn = (s: GameState, square: SquareId, d: Decision): GameState => ({ ...s, team: { ...s.team, waitFor: null, decisions: { ...s.team.decisions, [square]: d } } });

// What ALPHA tells HQ: its decision, not a question.
const say = (s: GameState, id: string, text: string): GameState => ({ ...s, comms: { ...s.comms, messages: [...s.comms.messages, radio(s, s.team.callsign, id, `HQ, ${s.team.callsign}, ${text}`)] } }); // called, then caller (ILI-1541)

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
      return reveal(next, neighbours(square).filter((n) => orionScanned(s, n))); // only scanned ground (ILI-1493)
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
  const known = (sq: SquareId) => !!knownTo(s, sq); // what ALPHA knows of, not HQ (ILI-1495)
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


// No dead air (ILI-1565): the ground moves. Every BEAT_MIN_MS to BEAT_MAX_MS of mission time (the
// mission's dice), one group not in a fight sets off for a square next to it, arriving MOVE_MS later.
// The square it leaves goes stale for HQ (moveContact); ALPHA still goes by what it was told, so HQ
// has a reason to look again. If HQ had found the group, the analysts call the movement.
export const BEAT_MIN_MS = 30_000;
export const BEAT_MAX_MS = 45_000;
export const MOVE_MS = 20_000;

export const moveSystem: System = (s) => {
  let next = s;
  // Arrivals.
  for (const c of s.contacts) if (c.move && s.elapsedMs >= c.move.arriveMs) next = moveContact(next, c.id, c.move.to);
  // The next beat.
  if (next.beatAtMs === undefined) {
    const [r, rng] = nextRandom(next.rng);
    return { ...next, rng, beatAtMs: next.elapsedMs + BEAT_MIN_MS + Math.round(r * (BEAT_MAX_MS - BEAT_MIN_MS)) };
  }
  if (next.elapsedMs < next.beatAtMs || next.phase !== 'running') return next;
  const [r1, rng1] = nextRandom(next.rng);
  const [r2, rng2] = nextRandom(rng1);
  const [r3, rng3] = nextRandom(rng2);
  const beatAtMs = next.elapsedMs + BEAT_MIN_MS + Math.round(r3 * (BEAT_MAX_MS - BEAT_MIN_MS));
  const here = squareAt(next.team.position.x, next.team.position.y);
  const taken = new Set(next.contacts.filter(live).map((c) => c.square));
  const movers = next.contacts.filter((c) => live(c) && !c.move && c.units.length && next.team.fight?.contactId !== c.id && c.square !== here && !isMissionPoint(next, c.square));
  const options = (c: Contact) =>
    nextSquares(c.square).filter((sq) => sq !== here && !taken.has(sq) && !isMissionPoint(next, sq));
  const able = movers.filter((c) => options(c).length);
  if (!able.length) return { ...next, rng: rng3, beatAtMs };
  const c = able[Math.floor(r1 * able.length)];
  const to = options(c)[Math.floor(r2 * options(c).length)];
  let moved = startMove({ ...next, rng: rng3, beatAtMs }, c.id, to, next.elapsedMs + MOVE_MS);
  if (c.status === 'revealed') {
    const line: Message = { id: `move-${c.id}-${next.elapsedMs}`, from: 'Analysts', text: `${c.square} imagery, movement: ${c.units.length} dismounts heading ${heading(c.square, to)}.`, atMs: next.elapsedMs, status: 'new', holds: false };
    moved = { ...moved, comms: { ...moved.comms, messages: [...moved.comms.messages, line] } };
  }
  return moved;
};

const nextSquares = (sq: SquareId) => {
  const p = parseSquare(sq);
  if (!p) return [];
  const out: SquareId[] = [];
  for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const col = p.col + dc;
    const row = p.row + dr;
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) out.push(squareId(col, row));
  }
  return out;
};

const heading = (from: SquareId, to: SquareId) => {
  const a = parseSquare(from)!;
  const b = parseSquare(to)!;
  return b.row < a.row ? 'north' : b.row > a.row ? 'south' : b.col > a.col ? 'east' : 'west';
};
