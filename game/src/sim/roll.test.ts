import { describe, expect, it } from 'vitest';
import { neighbours } from './contacts';
import { ENEMY_CHANCE, GROUP_SIZE, rollContacts } from './roll';
import { initialState, MISSION_SEED } from './state';

// Every square rolls what it holds at mission start, hidden (ILI-1544).
describe('the map is rolled, not authored', () => {
  it('the same seed rolls the same ground; another seed rolls other ground', () => {
    expect(rollContacts(7, 'G5')).toEqual(rollContacts(7, 'G5'));
    expect(rollContacts(7, 'G5')).not.toEqual(rollContacts(8, 'G5'));
    expect(initialState().contacts).toEqual(rollContacts(MISSION_SEED, 'G5'));
  });

  it('every group starts hidden, 2 to 6 fighters on distinct cells, and has no plan to move', () => {
    for (let seed = 1; seed <= 50; seed++)
      for (const c of rollContacts(seed, 'G5')) {
        expect(c.status).toBe('hidden');
        expect(c.units.length).toBeGreaterThanOrEqual(GROUP_SIZE[0]);
        expect(c.units.length).toBeLessThanOrEqual(GROUP_SIZE[1]);
        expect(new Set(c.units).size).toBe(c.units.length);
        expect(c.planTo).toBeUndefined();
        expect(c.move).toBeUndefined();
      }
  });

  it('the insert square and the ground around it roll no enemies', () => {
    const clear = new Set(['G5', ...neighbours('G5')]);
    for (let seed = 1; seed <= 50; seed++) expect(rollContacts(seed, 'G5').some((c) => clear.has(c.square))).toBe(false);
  });

  it('about ENEMY_CHANCE of the open squares hold a group', () => {
    const open = 40 - 1 - neighbours('G5').length;
    const groups = Array.from({ length: 200 }, (_, seed) => rollContacts(seed, 'G5').length).reduce((a, b) => a + b, 0);
    expect(groups / (200 * open)).toBeCloseTo(ENEMY_CHANCE, 1);
  });
});
