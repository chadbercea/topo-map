import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { GHOST_MS } from './imagery';
import { sightings } from './sightings';

// Brackets mean interaction, and only what HQ can see gets them (ILI-1410).
const spots = (s: GameState) => new Map(s.team.operators.map((o, i) => [o.id, { x: 100 + i, y: 100 }]));

// A picture of the first contact's square, taken at `atMs`.
const pictured = (s: GameState, atMs: number): GameState => {
  const c = s.contacts[0];
  const seen = [{ contactId: c.id, x: 0, y: 0, units: c.units }];
  return { ...s, contacts: s.contacts.map((x) => (x.id === c.id ? { ...x, status: 'revealed' as const } : x)), imagery: { [c.square]: { square: c.square, atMs, mode: 'eyes' as const, seen, live: false } } as GameState['imagery'] };
};

describe('sightings', () => {
  it('always brackets every operator, satellite or not', () => {
    const s = initialState();
    const ops = sightings(s, spots(s)).filter((t) => t.kind === 'operator');
    expect(ops).toHaveLength(s.team.operators.length);
  });

  it('brackets each fighter on a picture that is not stale, and drops them once it is', () => {
    const s = pictured(initialState(), 0);
    const fighters = s.contacts[0].units.length;
    expect(sightings(s, spots(s)).filter((t) => t.kind === 'hostile')).toHaveLength(fighters);
    const old = { ...s, elapsedMs: GHOST_MS + 1 };
    expect(sightings(old, spots(old)).filter((t) => t.kind === 'hostile')).toHaveLength(0);
  });
});

// Fog of war (ILI-1416): a live look follows a group only while it's in the watched square.
describe('a group walking out of a live picture', () => {
  it('shows while inside the square, and is gone once it walks into unseen ground', () => {
    const s0 = pictured(initialState(), 0);
    const c = s0.contacts[0];
    const live = { ...s0, imagery: { [c.square]: { ...s0.imagery[c.square]!, live: true } } } as GameState;
    const fighters = (s: GameState) => sightings(s, spots(s)).filter((t) => t.kind === 'hostile').length;
    expect(fighters(live)).toBe(c.units.length);
    // Off east, a square nobody is looking at: half way there it's already out of the picture.
    const to = String.fromCharCode(c.square.charCodeAt(0) + 2) + c.square.slice(1);
    const going = { ...live, contacts: live.contacts.map((x) => (x.id === c.id ? { ...x, move: { from: c.square, to, fromMs: 0, arriveMs: 10_000 } } : x)) };
    expect(fighters({ ...going, elapsedMs: 1_000 })).toBe(c.units.length); // still in the square
    expect(fighters({ ...going, elapsedMs: 9_000 })).toBe(0); // gone into the fog
  });
});
