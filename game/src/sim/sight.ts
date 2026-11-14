import { METRES_PER_UNIT, squareAt } from '../map/grid';
import { heightAt, theater, SAMPLE, type Terrain } from '../map/terrain';
import { groupOrigin, unitSpot } from './imagery';
import type { Contact } from './contacts';
import type { GameState } from './state';

// ALPHA's own eyes (ILI-1512): it doesn't see every enemy in its square. A fighter is in sight when
// he's close enough and no ground stands between them: the sight line from one man's eyes to the
// other's clears every point of the elevation data along the way. Plain geometry on the same
// heights the map draws, so the same ground always gives the same answer.

export const SIGHT_M = 250; // how far ALPHA picks out a fighter on open ground, and how far a fighter picks out ALPHA
export const FORCED_M = 50; // closer than this, units always meet: contact, ground or no ground (ILI-1544)
export const EYE_M = 1.7; // eye height above the ground, both ends

type Point = { x: number; y: number };

// Line of sight between two points on the ground (world units), eye height at both ends.
export function lineOfSight(a: Point, b: Point, t: Terrain = theater()): boolean {
  const ha = heightAt(t, a.x, a.y) + EYE_M;
  const hb = heightAt(t, b.x, b.y) + EYE_M;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.floor(d / (SAMPLE / 2)); // twice the elevation data's resolution
  for (let i = 1; i < n; i++) {
    const f = i / n;
    if (heightAt(t, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f) > ha + (hb - ha) * f) return false;
  }
  return true;
}

// In sight: in range, and nothing in the way.
export const inSight = (a: Point, b: Point, t: Terrain = theater()) => Math.hypot(b.x - a.x, b.y - a.y) * METRES_PER_UNIT <= SIGHT_M && lineOfSight(a, b, t);

const live = (c: Contact) => (c.status === 'hidden' || c.status === 'revealed') && c.units.length > 0;
// Still on the ground: a group ALPHA routed around (avoided) is still there, and still has eyes.
const standing = (c: Contact) => (c.status === 'hidden' || c.status === 'revealed' || c.status === 'avoided') && c.units.length > 0;

// Where a group's fighters stand right now.
export const fighterSpots = (c: Contact, now: number) => {
  const o = groupOrigin(c, now);
  return c.units.map((u) => unitSpot(o, u));
};

// The groups ALPHA can see from where it stands: any of their fighters in sight.
export function inView(s: GameState): Contact[] {
  if (!s.team.operators.some((o) => o.health > 0)) return [];
  const at = s.team.position;
  const reach = SIGHT_M / METRES_PER_UNIT;
  return s.contacts.filter((c) => live(c) && fighterSpots(c, s.elapsedMs).some((p) => Math.hypot(p.x - at.x, p.y - at.y) <= reach && inSight(at, p)));
}

// Contact is one rule, the same for both sides (ILI-1544): it starts the moment either side can see
// the other (in range, with no ground in the way; sight is symmetric) or they're within FORCED_M of
// each other. Never from walking into a square: a group across the square out of sight is no
// contact, and a group ALPHA walks up to never lets it pass.
export function inContact(s: GameState): Contact | undefined {
  if (!s.team.operators.some((o) => o.health > 0)) return undefined;
  const at = s.team.position;
  const reach = SIGHT_M / METRES_PER_UNIT;
  const forced = FORCED_M / METRES_PER_UNIT;
  let best: { c: Contact; d: number } | undefined;
  for (const c of s.contacts) {
    if (!standing(c)) continue;
    for (const p of fighterSpots(c, s.elapsedMs)) {
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if ((d <= forced || (d <= reach && lineOfSight(at, p))) && (!best || d < best.d)) best = { c, d };
    }
  }
  return best?.c;
}

// What ALPHA sees goes into its own picture (team.known, picture.ts): a group it has eyes on is
// where it sees it, with as many fighters as it has. Nothing it can't see changes. A group in its
// own square that it sees is contact: the firefight takes that, ambush or not, on what ALPHA knew
// before it saw them (ILI-1496).
// Since contact is symmetric (ILI-1544), any group ALPHA sees sees it too: that's contact on the
// next tick, and seeing them first gives ALPHA no edge. Only while it's tied up (in a fight, or
// treating its wounded) does a group it watches go into its picture ahead of contact.
export const sightSystem = (s: GameState): GameState => {
  if (!s.team.fight && !s.team.treating) return s;
  const here = squareAt(s.team.position.x, s.team.position.y);
  const seen = inView(s).filter((c) => c.square !== here);
  if (!seen.length) return s;
  let known = s.team.known;
  for (const c of seen) {
    const k = known[c.id];
    if (k?.square === c.square && k.units === c.units.length && s.elapsedMs - k.atMs < 1_000) continue;
    known = { ...known, [c.id]: { square: c.square, units: c.units.length, atMs: s.elapsedMs } };
  }
  return known === s.team.known ? s : { ...s, team: { ...s.team, known } };
};
