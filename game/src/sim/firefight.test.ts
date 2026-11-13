import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import type { Contact } from './contacts';
import type { GameState } from './state';
import { step } from './systems';
import { LOADOUT } from './team';
import { playUntil, run, walking } from './testkit';
import { wrapUp } from './wrapup';
import { AMBUSH_COVER_MS, AMBUSH_EDGE, COVER_FIRE, INITIATIVE } from './firefight';
import { FRESH_MS, GHOST_MS } from './imagery';

// The team standing in E3 with a contact there: found, sent to ALPHA (ILI-1495) and attacked, or
// never found. toldAtMs: when ALPHA got its intel (fresh by default).
const inContact = (status: Contact['status'] = 'revealed', attack = true, toldAtMs = 20_000): GameState => {
  const s = walking();
  const next: GameState = {
    ...s,
    elapsedMs: 20_000,
    contacts: [{ id: 'c', square: 'E3', label: 'test', strength: 1, status, observed: false, units: [0, 5], total: 2 }],
    team: { ...s.team, position: squareCenter('E3')!, waypoint: 3, decisions: attack ? { E3: 'attack' } : {} },
  };
  return status === 'revealed' ? { ...next, team: { ...next.team, known: { c: { square: 'E3', units: 2, atMs: toldAtMs } } } } : next;
};
// The checkpoint (the mission's hardest group), walked into with ALPHA knowing nothing.
const blindInto = (s0: GameState = walking()): GameState => ({
  ...s0,
  elapsedMs: 20_000,
  contacts: [{ id: 'checkpoint', square: 'E3', label: 'a fortified checkpoint', strength: 1.6, status: 'hidden', observed: false, units: [1, 5, 6, 9, 10], total: 5 }],
  team: { ...s0.team, position: squareCenter('E3')!, waypoint: 3 },
});
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

  it('an attack on intel ALPHA got has the initiative, and the fresher the intel the bigger the edge (ILI-1496)', () => {
    expect(step(inContact('revealed', true), 100).team.fight!.full).toBe(INITIATIVE.fresh * 100);
    expect(step(inContact('revealed', true, 20_000 - FRESH_MS - 1), 100).team.fight!.full).toBeCloseTo(INITIATIVE.ghost * 100);
    expect(step(inContact('revealed', true, 20_000 - GHOST_MS - 1), 100).team.fight!.full).toBeCloseTo(INITIATIVE.stale * 100);
    // And it pays out on the team: the same fight on stale intel costs more health.
    const end = (s: GameState) => run(s, 60_000);
    const health = (s: GameState) => end(s).stats.lost.length * 1000 + (500 - totalHealth(run(s, 15_000)));
    expect(health(step(inContact('revealed', true, 20_000 - GHOST_MS - 1), 100))).toBeGreaterThan(health(step(inContact('revealed', true), 100)));
  });

  it('HQ found it but never sent it: ALPHA walks in blind, and it\u2019s an ambush all the same (ILI-1496)', () => {
    const s0 = inContact('revealed', false);
    const s = step({ ...s0, team: { ...s0.team, known: {} } }, 100);
    expect(s.team.fight).toMatchObject({ ambush: true });
    expect(s.comms.messages.at(-1)?.text).toBe('Ambush in E3! Returning fire.');
  });

  it('a group ALPHA knew nothing of is an ambush: their first volley is aimed, it fights back from cover, and they fight harder', () => {
    const s = step(inContact('hidden', false), 100);
    expect(s.team.fight).toMatchObject({ square: 'E3', ambush: true, coverUntilMs: 20_100 + AMBUSH_COVER_MS, full: AMBUSH_EDGE * 100 });
    expect(s.comms.messages.at(-1)?.text).toBe('Ambush in E3! Returning fire.');
    // The opening seconds: one man takes all of it, and ALPHA is barely shooting back.
    const early = run(s, AMBUSH_COVER_MS - 200);
    expect(early.team.operators.filter((o) => o.health < 100)).toHaveLength(1);
    expect(totalAmmo(s) - totalAmmo(early)).toBeLessThan(23 * (AMBUSH_COVER_MS / 1000) * COVER_FIRE + 1);
  });

  it('walking blind into the checkpoint costs men, but isn\u2019t the end: ALPHA comes out of it (ILI-1496, not ILI-1453\u2019s wipe)', () => {
    const s = run(blindInto(), 60_000);
    expect(s.team.fight).toBeNull();
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.stats.lost.length).toBeGreaterThanOrEqual(1);
    expect(s.team.operators.some((o) => o.health > 0)).toBe(true);
    // The same checkpoint, sent to ALPHA and taken on its terms: nobody lost.
    const b = blindInto();
    const known = run({ ...b, contacts: [{ ...b.contacts[0], status: 'revealed' }], team: { ...b.team, decisions: { E3: 'attack' }, known: { checkpoint: { square: 'E3', units: 5, atMs: 20_000 } } } }, 60_000);
    expect(known.contacts[0].status).toBe('cleared');
    expect(known.stats.lost).toEqual([]);
  });

  it('a wipe in an ambush still reads as one on the wrap-up', () => {
    const s0 = blindInto();
    const s = run({ ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i ? { ...o, health: 0 } : o)) } }, 30_000);
    expect(s.phase).toBe('ended');
    expect(wrapUp(s)).toMatchObject({ outcome: 'failed', reason: 'ALPHA walked into E3 without a look. No survivors.' });
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
    const s = run(inContact('revealed', false), 60_000);
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
