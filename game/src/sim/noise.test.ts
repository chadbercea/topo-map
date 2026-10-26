import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { ALERT_AT, ALERT_HARDEN, FADE_PER_S, NOISE } from './noise';
import type { GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { run, walking } from './testkit';

const withContacts = (): GameState => {
  const s = walking();
  return {
    ...s,
    contacts: [
      { id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed: false, units: [5, 6, 9, 10], total: 4 },
      { id: 'p', square: 'C2', label: 'a patrol', strength: 0.7, status: 'hidden', observed: false, units: [1, 7, 12], total: 3 },
    ],
  };
};

describe('noise', () => {
  it('a drone strike is loud; a sniper round is quiet', () => {
    const drone = createStore(withContacts());
    drone.fire('t', 'drone');
    drone.tapMiniGame('E3', 0);
    expect(drone.get().noise).toBe(NOISE.drone);
    const sniper = createStore(withContacts());
    sniper.fire('t', 'sniper');
    sniper.tapMiniGame('E3', 0);
    expect(sniper.get().noise).toBe(NOISE.sniperRound);
  });

  it('a firefight makes noise too', () => {
    const s0 = withContacts();
    const s = step({ ...s0, team: { ...s0.team, position: squareCenter('E3')!, waypoint: 3 } }, 100);
    expect(s.team.fight).not.toBeNull();
    expect(s.noise).toBe(NOISE.firefight);
  });

  it('fades over time', () => {
    const s = run({ ...withContacts(), noise: 30 }, 10_000);
    expect(s.noise).toBeCloseTo(30 - FADE_PER_S * 10, 5);
  });

  it('past the threshold the enemy is alerted: HQ warns, live contacts harden', () => {
    const s = step({ ...withContacts(), noise: ALERT_AT + 1 }, 100);
    expect(s.alerted).toBe(true);
    expect(s.comms.messages.find((m) => m.id === 'enemy-alerted')).toMatchObject({ from: 'HQ', text: expect.stringMatching(/know a PMC is in the area/) });
    expect(s.contacts[0].strength).toBeCloseTo(ALERT_HARDEN);
    expect(s.contacts[1].strength).toBeCloseTo(0.7 * ALERT_HARDEN);
    expect(step(s, 100).contacts[0].strength).toBeCloseTo(ALERT_HARDEN); // once, not every tick
  });

  it('an alerted enemy springs harder ambushes', () => {
    const at = (alerted: boolean) => {
      const s0 = withContacts();
      const s = step({ ...s0, alerted, team: { ...s0.team, position: squareCenter('C2')!, waypoint: 5 } }, 100);
      return s.team.operators.reduce((n, o) => n + o.health, 0);
    };
    expect(at(true)).toBeLessThan(at(false));
  });
});
