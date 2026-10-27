import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { reveal } from './contacts';
import { PATROL_MOVES_MS, PATROL_WALK_MS } from './missions/blackBox';
import { RECOVER_MS } from './mission';
import { initialState, type GameState } from './state';
import { step } from './systems';
import { run } from './testkit';

const patrol = (s: GameState) => s.contacts.find((c) => c.id === 'patrol')!;
// Jump to when it sets off (half a minute before), then to ms.
const at = (ms: number, s: GameState = initialState()): GameState =>
  step({ ...step({ ...s, elapsedMs: ms - PATROL_WALK_MS - 100 }, 100), elapsedMs: ms - 100 }, 100);

describe('the patrol hunting the drone', () => {
  it('moves onto the crash site at 2:30 if nobody stopped it, silently if nobody found it', () => {
    const s = at(PATROL_MOVES_MS);
    expect(patrol(s).square).toBe('D3');
    expect(s.comms.messages.some((m) => m.id === 'patrol-at-crash-site')).toBe(false);
  });

  it('found first (by imagery or an intercept), HQ calls the move and its marker follows', () => {
    const found = reveal(initialState(), ['C2'], 'SIGINT');
    const s = at(PATROL_MOVES_MS, found);
    expect(patrol(s).square).toBe('D3');
    expect(s.events.find((e) => e.id === 'contact-patrol')?.square).toBe('D3');
    expect(s.comms.messages.find((m) => m.id === 'patrol-at-crash-site')?.text).toMatch(/moving onto the crash site in D3/);
  });

  it('a patrol already destroyed goes nowhere', () => {
    const s0 = initialState();
    const dead = { ...s0, contacts: s0.contacts.map((c) => (c.id === 'patrol' ? { ...c, status: 'cleared' as const } : c)) };
    expect(patrol(at(PATROL_MOVES_MS, dead)).square).toBe('C2');
  });

  it('too late once ALPHA has the black box', () => {
    const s0 = initialState();
    const done = { ...s0, mission: { ...s0.mission, blackBox: true, phase: 'exfil' as const } };
    expect(patrol(at(PATROL_MOVES_MS, done)).square).toBe('C2');
  });

  it('walking in on ALPHA at the crash site starts a fight there, and the recovery waits for it', () => {
    const s0 = initialState();
    let s: GameState = {
      ...s0,
      // Already on its way, due at 2:30.
      contacts: s0.contacts
        .filter((c) => c.id === 'patrol')
        .map((c) => ({ ...c, move: { from: 'C2', to: 'D3', fromMs: PATROL_MOVES_MS - PATROL_WALK_MS, arriveMs: PATROL_MOVES_MS } })),
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
