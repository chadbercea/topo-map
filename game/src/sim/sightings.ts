import { CELL, squareAt, squareCenter } from '../map/grid';
import type { GameState } from './state';
import { follows, freshness, shownAt, unitSpot, type Freshness } from './imagery';
import { aircraftAt } from './air';
import { transportAt } from './exfil';

// Everything on the map HQ can interact with (ILI-1408), and only that: brackets mean it can be
// hovered and clicked, no brackets mean no interaction (ILI-1410).
// - its own operators, always (a blue-force tracker on their radios);
// - whatever ORION-3's newest picture of a square shows while that picture isn't stale: hostile
//   fighters, kill sites, the wreck;
// - the event pings and the SIGINT diamonds, always.
// team: ALPHA as one target, the main map's (ILI-1443); operator: each man, ORION-3's picture's.
export type SightingKind = 'team' | 'operator' | 'hostile' | 'site' | 'wreck' | 'event' | 'signal' | 'aircraft';
export type Sighting = { id: string; kind: SightingKind; x: number; y: number; age: Freshness | 'tracked'; square: string };

// The age of the newest picture of a square, or null if there is none or it has gone stale.
const seenAt = (s: GameState, square: string | null) => {
  const snap = square ? s.imagery[square] : undefined;
  const age = snap && freshness(snap, s.elapsedMs);
  return age && age !== 'stale' ? age : null;
};

// Where a square's ping sits (MapScene.markerPos): its upper-right quarter.
export const markerSpot = (square: string) => {
  const c = squareCenter(square)!;
  return { x: c.x + CELL * 0.25, y: c.y - CELL * 0.25 };
};

// A fighter's id: his contact and the cell he was placed in, which stays his for the mission.
export const fighterId = (contactId: string, cell: number) => `${contactId}:${cell}`;

// operators: where the map drew each operator this frame (their dots wander a little).
export function sightings(s: GameState, operators: ReadonlyMap<string, { x: number; y: number }>): Sighting[] {
  const out: Sighting[] = [];
  for (const o of s.team.operators) {
    const at = operators.get(o.id);
    if (at) out.push({ id: `op:${o.id}`, kind: 'operator', x: at.x, y: at.y, age: 'tracked', square: squareAt(at.x, at.y) ?? '' });
  }
  if (operators.size) {
    const spots = [...operators.values()];
    const x = spots.reduce((n, p) => n + p.x, 0) / spots.length;
    const y = spots.reduce((n, p) => n + p.y, 0) / spots.length;
    out.push({ id: 'team', kind: 'team', x, y, age: 'tracked', square: squareAt(x, y) ?? '' });
  }
  for (const snap of Object.values(s.imagery)) {
    const age = freshness(snap, s.elapsedMs);
    if (age === 'stale') continue;
    for (const seen of snap.seen) {
      const c = s.contacts.find((x) => x.id === seen.contactId);
      if (!c || c.status === 'cleared') continue;
      const o = shownAt(snap, seen, c, s.elapsedMs);
      if (!o) continue; // walked out of the picture into unseen ground (ILI-1416)
      for (const u of follows(snap) ? c.units : seen.units) out.push({ id: fighterId(c.id, u), kind: 'hostile', ...unitSpot(o, u), age, square: snap.square });
    }
  }
  // Kill sites: every X a strike left, while the square's picture holds.
  const now = s.elapsedMs;
  const kills = [...(s.sniper?.shots ?? []).filter((x) => x.hit), ...(s.drone?.kills ?? []), ...(s.heli?.kills ?? [])].filter((k) => k.atMs <= now);
  for (const k of kills) {
    const square = squareAt(k.x, k.y);
    const age = seenAt(s, square);
    if (age && square) out.push({ id: `site:${Math.round(k.x)}:${Math.round(k.y)}`, kind: 'site', x: k.x, y: k.y, age, square });
  }
  const wreck = squareCenter(s.mission.b);
  const wreckAge = seenAt(s, s.mission.b);
  if (wreck && wreckAge && !s.mission.blackBox) out.push({ id: 'wreck', kind: 'wreck', ...wreck, age: wreckAge, square: s.mission.b });
  for (const e of s.events) {
    if (e.status === 'resolved' || e.kind === 'site') continue; // a kill site's X marks stand for it (ILI-1252)
    out.push({ id: e.id, kind: 'event', ...markerSpot(e.square), age: 'tracked', square: e.square });
  }
  // Our own aircraft, always (ILI-1420): REAPER-1, HAMMER-2, and RAVEN-6 for the exfil.
  for (const w of ['drone', 'heli'] as const) {
    const run = w === 'drone' ? s.drone : s.heli;
    const at = run && aircraftAt(run, now);
    if (run && at) out.push({ id: `air:${w}`, kind: 'aircraft', x: at.x, y: at.y, age: 'tracked', square: run.square });
  }
  const bird = s.exfil && transportAt(s.exfil, now);
  if (s.exfil && bird) out.push({ id: 'air:exfil', kind: 'aircraft', x: bird.x, y: bird.y, age: 'tracked', square: s.exfil.square });
  for (const d of s.decoded) out.push({ id: d.id, kind: 'signal', ...markerSpot(d.square), age: 'tracked', square: d.square });
  return out;
}
