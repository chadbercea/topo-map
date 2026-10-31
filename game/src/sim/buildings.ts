import { squareAt, type SquareId } from '../map/grid';
import type { Message } from './comms';
import { feed } from './intel';
import { earn } from './sites';
import type { GameState } from './state';
import type { System } from './systems';

// Buildings (ILI-1316): the hunt. A photo of empty ground sometimes turns up a building worth a
// search: RNG by square, seeded, so a mission replays. It pings on the map; HQ decides whether
// to spend mission time sending ALPHA to it. ALPHA detours through the square, searches it, and
// what it finds pays on the spot and feeds its gauge: a folder, a hard drive, a person who can
// be paid for what they know. Starting values are Claude's picks, for tuning by feel.

export const BUILDING_CHANCE = 0.25; // of an empty square HQ photographs
export const SEARCH_MS = 20_000;
export const BUILDING_INTEL = 30;
export const FINDS = [
  { what: 'a folder of maps and orders', cash: 50_000 },
  { what: 'a hard drive', cash: 150_000 },
  { what: 'a local who knows the ground, and will talk for money', cash: 300_000 },
] as const;

// The square's own dice, seeded by the mission: 0 to 1.
function roll(s: GameState, square: SquareId, salt: number): number {
  let h = (s.rng ^ salt) >>> 0;
  for (const ch of square) h = Math.imul(h ^ ch.charCodeAt(0), 2246822519) >>> 0;
  h ^= h >>> 15;
  return (Math.imul(h, 3266489917) >>> 0) / 4_294_967_296;
}

export const buildingId = (square: SquareId) => `building-${square}`;
export const findIn = (s: GameState, square: SquareId) => FINDS[Math.floor(roll(s, square, 7) * FINDS.length)];

// After a photo of empty ground: a building, maybe. Nothing's marked for nothing.
export function maybeBuilding(s: GameState, square: SquareId): GameState {
  const id = buildingId(square);
  if (s.events.some((e) => e.id === id) || roll(s, square, 3) >= BUILDING_CHANCE) return s;
  return { ...s, events: [...s.events, { id, kind: 'building', square, title: 'A building worth a search', atMs: s.elapsedMs, status: 'new' }] };
}

// HQ sends ALPHA: the square goes onto its route next, unless it's already on the way.
export function sendToSearch(s: GameState, square: SquareId): GameState {
  const e = s.events.find((x) => x.id === buildingId(square) && x.status !== 'resolved');
  if (!e || s.searching.includes(square)) return s;
  const { route, waypoint } = s.team;
  const onRoute = route.slice(waypoint).includes(square) || squareAt(s.team.position.x, s.team.position.y) === square;
  const next: GameState = { ...s, searching: [...s.searching, square], events: s.events.map((x) => (x === e ? { ...x, status: 'seen' as const } : x)) };
  if (onRoute) return next;
  return { ...next, team: { ...next.team, route: [...route.slice(0, waypoint), square, ...route.slice(waypoint)] } };
}

const radio = (s: GameState, id: string, text: string): Message => ({ id, from: s.team.callsign, text, atMs: s.elapsedMs, status: 'new', holds: false });

// In a building HQ sent it to: it holds and searches, then reports what it found.
export const buildingSystem: System = (s) => {
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
  const paid = feed(earn(s, find.cash), BUILDING_INTEL);
  return {
    ...paid,
    searching: paid.searching.filter((sq) => sq !== here),
    stats: { ...paid.stats, searched: paid.stats.searched + 1 },
    events: paid.events.map((e) => (e.id === id ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...paid.comms, messages: [...paid.comms.messages, radio(s, `found-building-${here}`, `Building in ${here} searched: ${find.what}. +$${find.cash.toLocaleString('en-US')}, and intel to keep us moving.`)] },
  };
};
