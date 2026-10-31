import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import { playUntil } from './testkit';

// Moving in blind pays out on the map (ILI-1309): reaching a square HQ sent ALPHA into blind
// records what ALPHA found there, and the square becomes known ground.
describe('moving in blind', () => {
  it('stamps each blind square with what ALPHA found on arrival: F4 clear, E3 the checkpoint', () => {
    const pick = (ids: string[]) => (ids.includes('blind') ? 'blind' : ids[0]);
    const s = playUntil(initialState(), (x) => x.map.blind.length >= 2, pick).get();
    expect(s.map.blind.map((b) => [b.square, b.found])).toEqual([
      ['F4', false],
      ['E3', true],
    ]);
    expect(s.map.scanned).toEqual(expect.arrayContaining(['F4', 'E3']));
  });

  it('a square HQ had imaged first stamps nothing', () => {
    const start = initialState();
    const s = playUntil({ ...start, map: { ...start.map, scanned: [...start.map.scanned, 'F4'] } }, (x) => x.team.waypoint >= 2, (ids) => (ids.includes('blind') ? 'blind' : ids[0])).get();
    expect(s.map.blind.some((b) => b.square === 'F4')).toBe(false);
  });
});
