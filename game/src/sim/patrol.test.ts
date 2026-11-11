import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { reveal } from './contacts';
import { PLAN_ALERTED, PLAN_DEPART_MS, PLAN_WALK_MS, planArriveMs, planDepartMs } from './enemy';
import { RECOVER_MS } from './mission';
import { initialState, type GameState } from './state';
import { step } from './systems';
import { run } from './testkit';

const patrol = (s: GameState) => s.contacts.find((c) => c.id === 'patrol')!;
// When it gets there, by the rule and the mission's dice (ILI-1454).
const due = (s: GameState) => planArriveMs(s, patrol(s));
// Jump to when it sets off (its walk before ms), then to ms: by default, when it's due.
const at = (s: GameState = initialState(), ms = due(s)): GameState =>
  step({ ...step({ ...s, elapsedMs: ms - PLAN_WALK_MS - 100 }, 100), elapsedMs: ms - 100 }, 100);
const PATROL_MOVES_MS = 250_000; // a fixed arrival, for the fight at the crash site

describe('the patrol hunting the drone', () => {
  it('moves onto the crash site if nobody stopped it, silently if nobody found it', () => {
    const before = at(initialState(), due(initialState()) - 100);
    expect(patrol(before).square).toBe('C2');
    expect(patrol(before).move?.to).toBe('D3'); // on its way
    const s = at();
    expect(patrol(s).square).toBe('D3');
    expect(s.comms.messages.some((m) => m.id === 'patrol-arrived')).toBe(false);
  });

  it('sets off when the mission\u2019s dice say, inside its window; the same seed, the same time (ILI-1454)', () => {
    const s0 = initialState();
    const depart = planDepartMs(s0, patrol(s0));
    expect(depart).toBeGreaterThanOrEqual(PLAN_DEPART_MS[0]);
    expect(depart).toBeLessThanOrEqual(PLAN_DEPART_MS[1]);
    expect(planDepartMs(initialState(), patrol(s0))).toBe(depart);
    const times = new Set([1, 2, 3, 4, 5].map((seed) => planDepartMs({ ...s0, seed }, patrol(s0))));
    expect(times.size).toBeGreaterThan(1);
  });

  it('alerted, it hurries', () => {
    const s0 = initialState();
    const alerted = { ...s0, alerted: true };
    expect(planDepartMs(alerted, patrol(s0))).toBe(Math.round(planDepartMs(s0, patrol(s0)) * PLAN_ALERTED));
    expect(patrol(at(alerted)).square).toBe('D3');
    expect(due(alerted)).toBeLessThan(due(s0));
  });

  it('found first (by imagery or an intercept), HQ calls the move and its marker follows', () => {
    const found = reveal(initialState(), ['C2'], 'SIGINT');
    const s = at(found);
    expect(patrol(s).square).toBe('D3');
    expect(s.events.find((e) => e.id === 'contact-patrol')?.square).toBe('D3');
    expect(s.comms.messages.find((m) => m.id === 'patrol-arrived')?.text).toMatch(/moving onto the crash site in D3/);
  });

  it('a patrol already destroyed goes nowhere', () => {
    const s0 = initialState();
    const dead = { ...s0, contacts: s0.contacts.map((c) => (c.id === 'patrol' ? { ...c, status: 'cleared' as const } : c)) };
    expect(patrol(at(dead, due(s0))).square).toBe('C2');
  });

  it('too late once ALPHA has the black box', () => {
    const s0 = initialState();
    const done = { ...s0, mission: { ...s0.mission, blackBox: true, phase: 'exfil' as const } };
    expect(patrol(at(done, due(s0))).square).toBe('C2');
  });

  it('walking in on ALPHA at the crash site starts a fight there, and the recovery waits for it', () => {
    const s0 = initialState();
    let s: GameState = {
      ...s0,
      // Already on its way, due at 2:30.
      contacts: s0.contacts
        .filter((c) => c.id === 'patrol')
        .map((c) => ({ ...c, move: { from: 'C2', to: 'D3', fromMs: PATROL_MOVES_MS - PLAN_WALK_MS, arriveMs: PATROL_MOVES_MS } })),
      map: { ...s0.map, scanned: [...s0.team.route] },
      team: { ...s0.team, position: squareCenter('D3')!, waypoint: 4 },
    };
    s = run(s, 1_000); // ALPHA starts pulling the drive
    expect(s.mission.phase).toBe('objective');
    s = { ...s, elapsedMs: PATROL_MOVES_MS - 100 };
    s = { ...s, mission: { ...s.mission, recoverUntilMs: PATROL_MOVES_MS + RECOVER_MS - 2_000 } };
    s = run(s, 300);
    expect(s.team.fight?.square).toBe('D3');
    expect(s.comms.messages.some((m) => m.id === 'crash-site-hit')).toBe(true);
    const box = s.mission.recoverUntilMs!;
    s = run(s, 3_000);
    expect(s.mission.blackBox).toBe(false);
    expect(s.mission.recoverUntilMs).toBeGreaterThan(box); // the fight pushed it back
  });
});
