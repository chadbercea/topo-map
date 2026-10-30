import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { legSpeed, BASE_SPEED } from './movement';
import { initialState, MISSION_MS, ROUTE, type GameState } from './state';
import { step } from './systems';
import { walking } from './testkit';

const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) s = step(s, 100);
  return s;
};

describe('legSpeed', () => {
  it('is full speed on flat or downhill, slower uphill', () => {
    expect(legSpeed(0)).toBe(BASE_SPEED);
    expect(legSpeed(-0.2)).toBe(BASE_SPEED);
    expect(legSpeed(0.25)).toBeCloseTo(BASE_SPEED / 2);
  });
});

describe('team movement', () => {
  it('starts at the first square heading for the second', () => {
    const s = initialState();
    expect(s.team.position).toEqual(squareCenter(ROUTE[0]));
    expect(s.team.activity).toBe(`Moving to ${ROUTE[1]}`);
  });

  it('moves on its own toward the next waypoint', () => {
    const s0 = walking();
    const goal = squareCenter(ROUTE[1])!;
    const d = (s: GameState) => Math.hypot(goal.x - s.team.position.x, goal.y - s.team.position.y);
    const s1 = run(s0, 5);
    expect(d(s1)).toBeLessThan(d(s0));
  });

  it('walks the whole route in order inside the mission time, then holds', () => {
    let s = walking();
    const reached: number[] = [];
    let seconds = 0;
    while (s.team.waypoint < ROUTE.length && seconds < MISSION_MS / 1000) {
      const before = s.team.waypoint;
      s = run(s, 1);
      seconds++;
      if (s.team.waypoint !== before) reached.push(before);
    }
    expect(reached).toEqual(ROUTE.slice(1).map((_, i) => i + 1));
    expect(seconds).toBeGreaterThan(60); // a walk, not a teleport
    expect(s.team.position).toEqual(squareCenter(ROUTE.at(-1)!));
    expect(s.team.activity).toMatch(/RAVEN-6/); // at exfil with the black box: waiting on the bird (ILI-1264)
    const held = run(s, 5);
    expect(held.team.position).toEqual(s.team.position);
  });


  it('does not move while paused', () => {
    const s = { ...run(walking(), 3), phase: 'paused' as const };
    expect(run(s, 5).team.position).toEqual(s.team.position);
  });
});
