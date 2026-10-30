import { FLIGHT_MS } from './drone';
import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { ALERT_AT, ALERT_HARDEN, FADE_PER_S, NOISE, NOISE_PER_ROUND } from './noise';
import type { GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { run, walking } from './testkit';

const withContacts = (): GameState => {
  const s = walking();
  return {
    ...s,
    contacts: [
      { id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed: false, painted: true, units: [5, 6, 9, 10], total: 4 },
      { id: 'p', square: 'C2', label: 'a patrol', strength: 0.7, status: 'hidden', observed: false, units: [1, 7, 12], total: 3 },
    ],
  };
};

describe('noise', () => {
  it('a drone strike is loud; a sniper round is quiet', () => {
    const drone = createStore(withContacts());
    drone.fire('t', 'drone');
    drone.set(run(drone.get(), FLIGHT_MS));
    expect(drone.get().noise).toBeGreaterThanOrEqual(NOISE.drone - 1); // heard as it arrives
    const sniper = createStore(withContacts());
    sniper.fire('t', 'sniper');
    sniper.set(run(sniper.get(), 700)); // its first round
    expect(sniper.get().noise).toBeCloseTo(NOISE.sniperRound, 0);
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

describe('noise per operator (ILI-1222)', () => {
  const inFight = () => {
    const s0 = withContacts();
    return step({ ...s0, team: { ...s0.team, position: squareCenter('E3')!, waypoint: 3 } }, 100);
  };
  const noiseOf = (s: GameState, id: string) => s.team.operators.find((o) => o.id === id)!.noise;

  it('whoever fires is heard: the heavy gunner louder than the medic', () => {
    const s = step(inFight(), 1_000);
    expect(noiseOf(s, 'heavy')).toBeGreaterThan(noiseOf(s, 'medic'));
    expect(noiseOf(s, 'medic')).toBeGreaterThan(0);
    expect(noiseOf(s, 'heavy')).toBeCloseTo(9 * NOISE_PER_ROUND, 1); // a second of fire; the fade starts next tick
  });

  it('fades like the rest', () => {
    const s0 = walking();
    const loud = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o) => ({ ...o, noise: 20 })) } };
    const s = run(loud, 10_000);
    expect(s.team.operators.every((o) => Math.abs(o.noise - (20 - FADE_PER_S * 10)) < 1e-6)).toBe(true);
  });

  it("doesn't alert the enemy on its own, for now: the alert runs on the total", () => {
    const s0 = withContacts();
    const s = step({ ...s0, team: { ...s0.team, operators: s0.team.operators.map((o) => ({ ...o, noise: 100 })) } }, 100);
    expect(s.alerted).toBe(false);
  });
});
