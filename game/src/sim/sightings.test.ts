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
