import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import type { Contact } from './contacts';
import type { GameState } from './state';
import { step } from './systems';
import { LOADOUT } from './team';
import { playUntil, run, walking } from './testkit';

// The team standing in E3 with a contact there: found and attacked, or never found.
const inContact = (status: Contact['status'] = 'revealed', attack = true): GameState => {
  const s = walking();
  return {
    ...s,
    elapsedMs: 20_000,
    contacts: [{ id: 'c', square: 'E3', label: 'test', strength: 1, status, observed: false, units: [0, 5], total: 2 }],
    team: { ...s.team, position: squareCenter('E3')!, waypoint: 3, decisions: attack ? { E3: 'attack' } : {} },
  };
};
const totalAmmo = (s: GameState) => s.team.operators.reduce((n, o) => n + o.ammo, 0);
const totalHealth = (s: GameState) => s.team.operators.reduce((n, o) => n + o.health, 0);

describe('firefight', () => {
  it('starts when the team stands in a square with a live contact', () => {
    const s = step(inContact(), 100);
    expect(s.team.fight).toMatchObject({ contactId: 'c', square: 'E3' });
    expect(s.team.activity).toBe('Engaged in E3');
    expect(s.comms.messages.at(-1)?.text).toBe('Contact! Engaging in E3.');
  });

  it('an attack on a found contact has surprise: the enemy starts at half strength', () => {
    expect(step(inContact('revealed', true), 100).team.fight!.full).toBe(50);
    expect(step(inContact('revealed', false), 100).team.fight!.full).toBe(100);
  });

  it('a contact nobody found is an ambush: full strength and an opening volley', () => {
    const s = step(inContact('hidden', false), 100);
    expect(s.team.fight!.full).toBe(100);
    expect(s.comms.messages.at(-1)?.text).toBe('Ambush in E3! Returning fire.');
    expect(totalHealth(s)).toBeLessThan(500 - 20);
  });

  it('burns ammo by role, wounds the team, and holds it in place', () => {
    const start = step(inContact('revealed', false), 100);
    const s = run(start, 3_000);
    expect(s.team.fight).not.toBeNull();
    expect(totalAmmo(s)).toBeLessThan(totalAmmo(start));
    expect(totalHealth(s)).toBeLessThan(totalHealth(start));
    expect(s.team.position).toEqual(start.team.position);
    const used = (role: string) => {
      const o = s.team.operators.find((x) => x.role === role)!;
      return LOADOUT[o.role].ammo - o.ammo;
    };
    expect(used('Heavy gunner')).toBeGreaterThan(used('Medic'));
  });

  it('its fighters fall as the fight wears them down, and each still pays when cleared (ILI-1275)', () => {
    const start = step(inContact('revealed', false), 100);
    let s = start;
    let seen = 2;
    while (s.team.fight && seen === 2) {
      s = step(s, 100);
      seen = s.contacts[0].units.length;
    }
    expect(s.team.fight).not.toBeNull(); // one dropped mid-fight, before the clear
    expect(seen).toBe(1);
    const end = run(s, 30_000);
    expect(end.contacts[0].status).toBe('cleared');
    expect(end.comms.messages.some((m) => /^E3 clear\..*\+\$20,000\.$/.test(m.text))).toBe(true); // both fighters paid
  });

  it('ends with the contact cleared and a report on the radio', () => {
    const s = run(inContact(), 30_000);
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.comms.messages.some((m) => /^E3 clear\./.test(m.text))).toBe(true);
  });

  it('the medic treats the wounded with their own meds, then the team moves on', () => {
    const s = run(inContact('hidden', false), 60_000);
    const medic = s.team.operators.find((o) => o.role === 'Medic')!;
    expect(medic.meds).toBeLessThan(LOADOUT.Medic.meds);
    expect(s.team.operators.filter((o) => o.health > 0).every((o) => o.health >= 90)).toBe(true);
    expect(s.team.treating).toBeNull();
    expect(s.comms.messages.some((m) => m.text === 'Patched up. Moving.')).toBe(true);
    expect(s.team.position).not.toEqual(squareCenter('E3')); // it walked on (to the crash site in D3)
  });

  it('plays out the same way every time', () => {
    expect(run(inContact(), 20_000)).toEqual(run(inContact(), 20_000));
  });

  it('does not run while paused', () => {
    const s = { ...step(inContact(), 100), phase: 'paused' as const };
    expect(run(s, 5_000)).toBe(s);
  });

  it('pushing through unimaged ground into a hidden contact is an ambush', () => {
    const store = playUntil(walking(), (s) => !!s.team.fight);
    expect(store.get().team.fight).toBeNull(); // walking(): no contacts, so no fight
    const blind = { ...walking(), contacts: [{ id: 'c', square: 'F4', label: 'test', strength: 1, status: 'hidden' as const, observed: false, units: [0], total: 1 }] };
    const s = playUntil(blind, (x) => !!x.team.fight).get();
    expect(s.team.fight?.square).toBe('F4');
    expect(s.comms.messages.some((m) => m.text.startsWith('Ambush in F4'))).toBe(true);
  });
});
