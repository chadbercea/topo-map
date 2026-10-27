import { describe, expect, it } from 'vitest';
import { ammoLeft, LOADOUT, medsLeft, roster } from './team';

describe('roster', () => {
  const team = roster();

  it('is the GDD five-man unit, each with a rank', () => {
    expect(team.map((o) => o.role)).toEqual(['Squad lead', 'Gunner', 'Medic', 'Navigator', 'Heavy gunner']);
    expect(new Set(team.map((o) => o.id)).size).toBe(5);
    for (const o of team) expect(o.rank.abbr).toMatch(/^[A-Z]{3}$/);
    expect(team[0].rank.grade).toBe(Math.max(...team.map((o) => o.rank.grade))); // lead outranks
  });

  it('starts everyone healthy and fully loaded', () => {
    for (const o of team) {
      expect(o.health).toBe(100);
      expect(ammoLeft(o)).toBe(1);
      expect(medsLeft(o)).toBe(1);
    }
  });

  it('gives the medic the least ammo and most meds, the heavy gunner the opposite', () => {
    const ammo = Object.values(LOADOUT).map((l) => l.ammo);
    const meds = Object.values(LOADOUT).map((l) => l.meds);
    expect(LOADOUT.Medic.ammo).toBe(Math.min(...ammo));
    expect(LOADOUT.Medic.meds).toBe(Math.max(...meds));
    expect(LOADOUT['Heavy gunner'].ammo).toBe(Math.max(...ammo));
    expect(LOADOUT['Heavy gunner'].meds).toBe(Math.min(...meds));
    for (const l of Object.values(LOADOUT)) expect(l.meds).toBeGreaterThanOrEqual(1); // everyone has an IFAK
  });

  it('hands out fresh operators each time', () => {
    expect(roster()[0]).not.toBe(roster()[0]);
  });
});
