import { squareAt, type SquareId } from '../map/grid';
import type { Message } from './comms';
import { feed, postBuildingIntel } from './intel';
import { earn } from './sites';
import type { GameState } from './state';
import { LOADOUT } from './team';
import type { System } from './systems';
import { neighbours, odds, TAKE_AT } from './contacts';
import { knownTo } from './picture';
import { exfilLocked } from './mission';

// Buildings (ILI-1316): the hunt. A photo of empty ground sometimes turns up a building worth a
// search: RNG by square, seeded, so a mission replays. It pings on the map; HQ decides whether
// to spend mission time sending ALPHA to it. ALPHA detours through the square, searches it, and
// what it finds pays on the spot: a folder, a hard drive, a person who can
// be paid for what they know. Starting values are Claude's picks, for tuning by feel.

export const BUILDING_CHANCE = 0.25; // of an empty square HQ photographs
export const SEARCH_MS = 20_000;
export const BUILDING_INTEL = 30;
export const FINDS = [
  { what: 'a folder of maps and orders', cash: 50_000 },
  { what: 'a hard drive', cash: 150_000 },
  { what: 'a local who knows the ground, and will talk for money', cash: 300_000 },
] as const;

// The square's own dice, seeded by the mission: 0 to 1. The mission's seed, not the fight dice,
// so a square is the same whatever was fought before (ILI-1454).
function roll(s: GameState, square: SquareId, salt: number): number {
  let h = (s.seed ^ salt) >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2246822519) >>> 0;
  h ^= h >>> 15;
  return (Math.imul(h, 3266489917) >>> 0) / 4_294_967_296;
}

export const buildingId = (square: SquareId) => `building-${square}`;
// Every search also turns up supplies (ILI-1434): half a loadout of ammo and of meds back for
// each operator still standing, up to a full one.
export const SUPPLY_SHARE = 0.5;
export const resupplied = (s: GameState): GameState['team']['operators'] =>
  s.team.operators.map((o) => {
    if (o.health <= 0) return o;
    const full = LOADOUT[o.role];
    return { ...o, ammo: Math.min(full.ammo, o.ammo + Math.round(full.ammo * SUPPLY_SHARE)), meds: Math.min(full.meds, o.meds + Math.ceil(full.meds * SUPPLY_SHARE)) };
  });

export const findIn = (s: GameState, square: SquareId) => FINDS[Math.floor(roll(s, square, 7) * FINDS.length)];

// After a photo of empty ground: a building, maybe. Nothing's marked for nothing.
export function maybeBuilding(s: GameState, square: SquareId): GameState {
  const id = buildingId(square);
  if (s.events.some((e) => e.id === id) || roll(s, square, 3) >= BUILDING_CHANCE) return s;
  return { ...s, events: [...s.events, { id, kind: 'building', square, title: 'A building worth a search', atMs: s.elapsedMs, status: 'new' }] };
}

// Reaching a building (ILI-1518). ALPHA judges it on its own picture of the enemy (picture.ts),
// never the ground truth, the same way it judges its route (contacts.ts):
// - a square with a contact ALPHA knows of is in the way, unless ALPHA would take that fight
//   anyway (odds at or under TAKE_AT). That goes for the building's own square too;
// - it plans a way there and back to its route around every square in the way. No way round:
//   it can't reach the building;
// - once it's on the way, its route is its route: if it later goes around the building's square
//   (a contact turned up there), the search is off and the building waits for HQ again.
// Contact it didn't know of is an ambush like anywhere else (firefight.ts); it searches once the
// fight is over.
export type Reach = { ok: true; route: SquareId[] } | { ok: false; why: 'contact' | 'cut-off'; at: SquareId };

// In the way, as ALPHA sees it: a contact it knows of, too strong to walk through.
export function blocking(s: GameState, square: SquareId): boolean {
  const k = knownTo(s, square);
  return !!k && odds(s, k.c, k.units) > TAKE_AT;
}

// The shortest walk, square by square, from one square to another, around what's in the way.
// The squares after `from`, up to and including `to`; null if there's no way.
function way(s: GameState, from: SquareId, to: SquareId): SquareId[] | null {
  if (from === to) return [];
  const prev = new Map<SquareId, SquareId>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const n of neighbours(at)) {
      if (prev.has(n) || blocking(s, n)) continue;
      prev.set(n, at);
      if (n === to) {
        const out = [n];
        for (let p = at; p !== from; p = prev.get(p)!) out.unshift(p);
        return out;
      }
      queue.push(n);
    }
  }
  return null;
}

// Can ALPHA reach the building in this square from where it is? If so, the route that takes it
// there and back to the square it was heading for.
export function reach(s: GameState, square: SquareId): Reach {
  const { route, waypoint } = s.team;
  const here = squareAt(s.team.position.x, s.team.position.y);
  if (here === square || route.slice(waypoint).includes(square)) return { ok: true, route }; // on its way already
  if (blocking(s, square)) return { ok: false, why: 'contact', at: square };
  const there = here ? way(s, here, square) : null;
  if (!there) return { ok: false, why: 'cut-off', at: square };
  // Back onto its route at the first square ahead it didn't already walk through on the way there.
  let j = waypoint;
  while (j < route.length && there.includes(route[j])) j++;
  const back = j < route.length ? way(s, square, route[j]) : [];
  if (!back) return { ok: false, why: 'cut-off', at: square };
  return { ok: true, route: [...route.slice(0, waypoint), ...there, ...back.slice(0, -1), ...route.slice(j)] };
}

// ALPHA goes: the way there goes onto its route next, if it can reach it.
export function sendToSearch(s: GameState, square: SquareId): GameState {
  const e = s.events.find((x) => x.id === buildingId(square) && x.status !== 'resolved');
  if (!e || s.searching.includes(square)) return s;
  const r = reach(s, square);
  if (!r.ok) return s;
  return { ...s, searching: [...s.searching, square], team: { ...s.team, route: r.route }, events: s.events.map((x) => (x === e ? { ...x, status: 'seen' as const, reach: 'going' as const } : x)) };
}

// HQ can't send ALPHA in (ILI-1517): it posts what it knows of the building on the shelf, like an
// Analyze's package. Once ALPHA has pulled it, ALPHA says whether it can get there, and goes if it
// can. HQ can post again after ALPHA couldn't, once the ground has changed.
export function postBuilding(s: GameState, square: SquareId): GameState {
  if (exfilLocked(s)) return s; // ILI-1545
  const e = s.events.find((x) => x.id === buildingId(square) && x.status !== 'resolved');
  if (!e || s.searching.includes(square)) return s;
  if (e.tasked && !e.reach) return s; // on the shelf, or ALPHA's still weighing it
  const { next, id } = postBuildingIntel(s, square);
  return { ...next, events: next.events.map((x) => (x.id === e.id ? { ...x, status: 'seen' as const, tasked: id, reach: undefined } : x)) };
}

// Why ALPHA can't, as it says it: short, plain.
const UNABLE = { contact: 'enemy in it', 'cut-off': 'no way round the enemy' } as const;
const unable = (s: GameState, square: SquareId, why: 'contact' | 'cut-off'): GameState => {
  const id = `unable-building-${square}-${s.elapsedMs}`;
  return {
    ...s,
    events: s.events.map((e) => (e.id === buildingId(square) ? { ...e, status: 'new' as const, reach: why } : e)),
    comms: { ...s.comms, messages: [...s.comms.messages, radio(s, id, `Unable to reach the building in ${square}: ${UNABLE[why]}.`)] },
  };
};

// ALPHA has pulled HQ's intel on a building: it weighs the way there (ILI-1518) and goes, or says
// it can't.
function weigh(s: GameState): GameState {
  let next = s;
  for (const e of s.events) {
    if (e.kind !== 'building' || e.status === 'resolved' || !e.tasked || e.reach) continue;
    if (next.intel.pushes.find((p) => p.id === e.tasked)?.state !== 'fed') continue;
    const r = reach(next, e.square);
    next = r.ok ? sendToSearch(next, e.square) : unable(next, e.square, r.why);
  }
  return next;
}

// A building ALPHA has gone around since (ILI-1518): off its route, so the search is off, and it
// says so.
function droppedOff(s: GameState): GameState {
  const here = squareAt(s.team.position.x, s.team.position.y);
  const ahead = s.team.route.slice(s.team.waypoint);
  const off = s.searching.filter((sq) => sq !== here && !ahead.includes(sq));
  if (!off.length) return s;
  return off.reduce((n, sq) => unable(n, sq, blocking(n, sq) ? 'contact' : 'cut-off'), { ...s, searching: s.searching.filter((sq) => !off.includes(sq)) });
}

// The square of the building ALPHA is inside, searching, or null (ILI-1418): while it searches
// the team is off the map.
export function searchingIn(s: GameState): SquareId | null {
  const here = squareAt(s.team.position.x, s.team.position.y);
  const inside = !!here && s.searching.includes(here) && !s.team.fight && s.elapsedMs < s.team.holdUntilMs && s.team.activity.startsWith('Searching the building');
  return inside ? here : null;
}

const radio = (s: GameState, id: string, text: string): Message => ({ id, from: s.team.callsign, text, atMs: s.elapsedMs, status: 'new', holds: false });

// In a building HQ sent it to: it holds and searches, then reports what it found.
export const buildingSystem: System = (s0) => {
  const s = droppedOff(weigh(s0));
  const { team } = s;
  if (team.fight || !s.searching.length) return s;
  const here = squareAt(team.position.x, team.position.y);
  if (!here || !s.searching.includes(here)) return s;
  const id = buildingId(here);
  const searchingId = `search-building-${here}`;
  // Arrived: hold and search.
  if (!s.comms.messages.some((m) => m.id === searchingId)) {
    return {
      ...s,
      team: { ...team, holdUntilMs: s.elapsedMs + SEARCH_MS, activity: `Searching the building in ${here}` },
      comms: { ...s.comms, messages: [...s.comms.messages, radio(s, searchingId, `At the building in ${here}. Searching it.`)] },
    };
  }
  if (s.elapsedMs < team.holdUntilMs) return s;
  // Done: what it found, paid on the spot, and the intel.
  const find = findIn(s, here);
  const paid = feed(earn(s, find.cash), BUILDING_INTEL, { source: 'ALPHA', square: here, items: [{ kind: 'HUMINT', heat: 'some', text: `${s.team.callsign} searched the building` }] });
  return {
    ...paid,
    team: { ...paid.team, operators: resupplied(paid) }, // and supplies, every time (ILI-1434)
    searching: paid.searching.filter((sq) => sq !== here),
    stats: { ...paid.stats, searched: paid.stats.searched + 1 },
    events: paid.events.map((e) => (e.id === id ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...paid.comms, messages: [...paid.comms.messages, radio(s, `found-building-${here}`, `Building in ${here} searched: ${find.what}, plus ammo and medical supplies. +$${find.cash.toLocaleString('en-US')}, and intel to keep us moving.`)] },
  };
};
