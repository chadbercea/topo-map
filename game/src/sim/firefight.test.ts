import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { LOADOUT } from './team';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
// The team standing in E3 with an uncleared contact there, no radio hold in the way.
const inContact = (): GameState => {
  const s = initialState();
  return {
    ...s,
    elapsedMs: 20_000,
    schedule: [],
    events: [{ id: 'c', kind: 'contact', square: 'E3', title: 'Test', atMs: 0, status: 'seen' }],
    comms: { ...s.comms, messages: [{ id: 'event-c', from: 'ALPHA', text: '', atMs: 0, status: 'read', holds: true, eventId: 'c' }] },
    team: { ...s.team, position: squareCenter('E3')!, waypoint: 3 },
  };
};
const totalAmmo = (s: GameState) => s.team.operators.reduce((n, o) => n + o.ammo, 0);
const totalHealth = (s: GameState) => s.team.operators.reduce((n, o) => n + o.health, 0);

describe('firefight', () => {
  it('starts when the team stands in a square with an uncleared contact', () => {
    const s = step(inContact(), 100);
    expect(s.team.fight).toMatchObject({ eventId: 'c', square: 'E3' });
    expect(s.team.activity).toBe('Engaged in E3');
    expect(s.comms.messages.at(-1)?.text).toBe('Contact! Engaging in E3.');
  });

  it('burns ammo by role, wounds the team, and holds it in place', () => {
    const start = step(inContact(), 100);
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

  it('ends with the contact cleared and a report on the radio', () => {
    const s = run(inContact(), 30_000);
    expect(s.events[0].status).toBe('resolved');
    expect(s.comms.messages.some((m) => /^E3 clear\./.test(m.text))).toBe(true);
  });

  it('the medic treats the wounded with their own meds, then the team moves on', () => {
    let s = run(inContact(), 30_000);
    s = run(s, 30_000);
    const medic = s.team.operators.find((o) => o.role === 'Medic')!;
    expect(medic.meds).toBeLessThan(LOADOUT.Medic.meds);
    expect(s.team.operators.filter((o) => o.health > 0).every((o) => o.health >= 90)).toBe(true);
    expect(s.team.treating).toBeNull();
    expect(s.comms.messages.some((m) => m.text === 'Patched up. Moving.')).toBe(true);
    const before = s.team.position;
    expect(run(s, 2_000).team.position).not.toEqual(before);
  });

  it('plays out the same way every time', () => {
    expect(run(inContact(), 20_000)).toEqual(run(inContact(), 20_000));
  });

  it('does not run while paused', () => {
    const s = { ...step(inContact(), 100), phase: 'paused' as const };
    expect(run(s, 5_000)).toBe(s);
  });

  it('pushing through on the radio leads into a fight', () => {
    const store = createStore(run(initialState(), 15_000));
    store.respond('event-contact-e3', 'push');
    let s = store.get();
    for (let i = 0; i < 1200 && !s.team.fight; i++) s = step(s, 100);
    expect(s.team.fight?.square).toBe('E3');
  });
});
