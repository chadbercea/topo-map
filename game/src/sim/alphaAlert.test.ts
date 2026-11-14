import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { alertSquares, strikeBlocked } from './strike';
import { firefightSystem } from './firefight';
import { createStore } from './store';
import { fed, FIXTURE, walking } from './testkit';
import type { GameState } from './state';

// ALPHA in contact on ground HQ hasn't scanned (ILI-1524): its square raises an ALERT anyway, and
// ALPHA paints the target so the drone, and only the drone, can go in without ORION-3.
const ambushed = (): GameState => {
  const s0 = fed(walking());
  const cp = FIXTURE().find((c) => c.id === 'checkpoint')!;
  const s = { ...s0, contacts: [cp], team: { ...s0.team, position: squareCenter('E3')!, waypoint: 2 } };
  return firefightSystem(s, 100);
};

describe('ALPHA in contact raises an ALERT', () => {
  it('on unscanned ground: the fight is a contact on the map and its square has an ALERT', () => {
    const s = ambushed();
    expect(s.team.fight).toMatchObject({ contactId: 'checkpoint', ambush: true });
    expect(s.intel.graded).not.toContain('E3');
    expect(s.events.find((e) => e.id === 'contact-checkpoint')).toMatchObject({ kind: 'contact', square: 'E3', status: 'new' });
    expect(alertSquares(s)).toContain('E3');
  });

  it('ALPHA paints them: the drone can fire without ORION-3; the sniper and heli still say why not', () => {
    const s = ambushed();
    const c = s.contacts[0];
    expect(strikeBlocked(s, 'drone', c)).toBeNull();
    expect(strikeBlocked(s, 'sniper', c)).toMatch(/not over E3/);
    expect(strikeBlocked(s, 'heli', c)).toMatch(/not over E3/);
    const store = createStore(s);
    store.fire('checkpoint', 'drone');
    expect(store.get().drone).toMatchObject({ square: 'E3' });
  });
});
