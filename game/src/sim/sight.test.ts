import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import type { Terrain } from '../map/terrain';
import { FORCED_M, inContact, inSight, inView, lineOfSight, SIGHT_M } from './sight';
import { fighterSpots } from './sight';
import { initialState as rolledState, type GameState } from './state';
import { fixed } from './testkit';
// A fixed enemy layout, not the rolled map (testkit FIXTURE, ILI-1544).
const initialState = (...a: Parameters<typeof rolledState>) => fixed(rolledState(...a));
import { step } from './systems';
import { firefightSystem } from './firefight';
import { eyesSystem } from './imagery';

// A strip of ground 0..400 world units wide, 10 units a sample, flat at 500 m but for an optional
// ridge across x = 200.
function ground(ridgeM = 0): Terrain {
  const cols = 41;
  const rows = 3;
  const heights = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) heights[j * cols + i] = 500 + (i === 20 ? ridgeM : 0);
  return { x0: 0, y0: 0, sample: 10, cols, rows, heights, min: 500, max: 500 + ridgeM };
}

// ALPHA alone with the mission's groups, standing at a point.
const at = (where: { x: number; y: number }, only?: string): GameState => {
  const s = initialState();
  return { ...s, contacts: only ? s.contacts.filter((c) => c.id === only) : s.contacts, team: { ...s.team, position: where, waypoint: 2 } };
};

describe('ALPHA’s sight (ILI-1512)', () => {
  it('a sight line clears open ground and is cut by a ridge taller than eye height', () => {
    const a = { x: 50, y: 10 };
    const b = { x: 350, y: 10 };
    expect(lineOfSight(a, b, ground())).toBe(true);
    expect(lineOfSight(a, b, ground(1))).toBe(true); // a fold lower than the eyes hides nothing
    expect(lineOfSight(a, b, ground(5))).toBe(false);
  });

  it('reaches SIGHT_M on open ground and no further', () => {
    const t = ground();
    const a = { x: 0, y: 10 };
    const reach = SIGHT_M / 2.5;
    expect(inSight(a, { x: reach - 1, y: 10 }, t)).toBe(true);
    expect(inSight(a, { x: reach + 1, y: 10 }, t)).toBe(false);
  });

  it('does not see every group in its own square: the patrol in C2 is behind the ground from its centre', () => {
    const s = at(squareCenter('C2')!, 'patrol');
    expect(inView(s)).toEqual([]);
    const after = firefightSystem(s, 100);
    expect(after.team.fight).toBeNull(); // no contact yet: out of sight, and not close enough to meet
    expect(eyesSystem(after, 100).imagery.C2?.seen).toEqual([]); // and its eyes report nobody
  });

  it('in sight in its own square is contact; ambush or not is what it knew before', () => {
    const s = at(squareCenter('E3')!, 'checkpoint');
    expect(inView(s).map((c) => c.id)).toEqual(['checkpoint']);
    const after = firefightSystem(s, 100);
    expect(after.team.fight).toMatchObject({ contactId: 'checkpoint', ambush: true });
    expect(eyesSystem(after, 100).imagery.E3?.seen.map((x) => x.contactId)).toEqual(['checkpoint']);
  });

  it('contact is the same rule for both sides, whatever the squares (ILI-1544): seen across a square edge is contact', () => {
    const s = step(at({ x: 1000, y: 500 }, 'checkpoint'), 100); // F3's edge, looking into E3
    expect(s.team.fight).toMatchObject({ contactId: 'checkpoint', square: 'E3' });
    const blind = step(at({ x: 1000, y: 650 }, 'checkpoint'), 100); // further down F4: neither side sees the other
    expect(blind.team.fight).toBeNull();
  });

  it('units that meet always resolve contact: inside FORCED_M it is contact, ground or no ground', () => {
    const s0 = at(squareCenter('C2')!, 'patrol');
    expect(inContact(s0)).toBeUndefined(); // out of sight across the square
    const man = fighterSpots(s0.contacts[0], s0.elapsedMs)[0];
    const close = { x: man.x + (FORCED_M / 2.5) * 0.8, y: man.y };
    const s = { ...s0, team: { ...s0.team, position: close } };
    expect(inContact(s)?.id).toBe('patrol');
    expect(firefightSystem(s, 100).team.fight).toMatchObject({ contactId: 'patrol' });
  });

  it('a group ALPHA routed around is still there: walk up on it and it is contact', () => {
    const s0 = at(squareCenter('E3')!, 'checkpoint');
    const s = { ...s0, contacts: s0.contacts.map((c) => ({ ...c, status: 'avoided' as const })) };
    const after = firefightSystem(s, 100);
    expect(after.team.fight).toMatchObject({ contactId: 'checkpoint' });
    expect(after.contacts[0].status).toBe('revealed');
  });
});
