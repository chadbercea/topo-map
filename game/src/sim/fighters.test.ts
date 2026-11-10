import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import { activityOf, conditionOf, satOver, weaponOf } from './fighters';

// What a satellite can tell about a fighter (ILI-1412).
describe('fighters', () => {
  it('each fighter carries one weapon for the mission, from the four a satellite can tell apart', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `c${i % 7}:${i}`);
    for (const id of ids) {
      expect(['Rifle', 'Machine gun', 'RPG', 'Sniper rifle']).toContain(weaponOf(id));
      expect(weaponOf(id)).toBe(weaponOf(id));
    }
    expect(new Set(ids.map(weaponOf)).size).toBe(4); // a mix, mostly riflemen
    expect(ids.filter((id) => weaponOf(id) === 'Rifle').length).toBeGreaterThan(80);
  });

  it('reads static, moving or firing; limping once his group is badly hurt in a fight', () => {
    const s = initialState();
    const c = s.contacts[0];
    expect(activityOf(s, c.id)).toBe('Static');
    const moving = { ...s, contacts: s.contacts.map((x) => (x.id === c.id ? { ...x, move: { from: c.square, to: c.square, fromMs: 0, arriveMs: 1 } } : x)) };
    expect(activityOf(moving, c.id)).toBe('Moving');
    const fight = { contactId: c.id, eventId: 'e', square: c.square, enemy: 30, full: 100, units: c.units.length, startedMs: 0 };
    const fighting = { ...s, team: { ...s.team, fight } };
    expect(activityOf(fighting, c.id)).toBe('Firing');
    expect(conditionOf(fighting, c.id)).toBe('Limping');
    expect(conditionOf(s, c.id)).toBe('Upright');
  });

  it('is redacted unless ORION-3 is over his square with a live picture', () => {
    const s = initialState();
    expect(satOver(s, s.contacts[0].square)).toBe(false);
  });
});
