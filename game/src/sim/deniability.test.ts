import { describe, expect, it } from 'vitest';
import { DISOWN_AT, WARN_AT } from './noise';
import { weaponBlocked } from './ordnance';
import type { GameState } from './state';
import { step } from './systems';
import { walking } from './testkit';
import { CONTRACT, wrapUp } from './wrapup';

const loud = (noise: number, s: GameState = walking()) => step({ ...s, noise }, 100);

describe('deniability', () => {
  it('quiet work keeps the client happy', () => {
    expect(loud(WARN_AT - 5).deniability).toBe('clean');
  });

  it('too loud and the client threatens to disown the operation', () => {
    const s = loud(WARN_AT + 1);
    expect(s.deniability).toBe('warned');
    expect(s.comms.messages.find((m) => m.id === 'client-warning')).toMatchObject({ from: 'CLIENT' });
  });

  it('keep going and it does: contract void, ordnance support cut', () => {
    const s = loud(DISOWN_AT + 1, loud(WARN_AT + 1));
    expect(s.deniability).toBe('disowned');
    expect(s.comms.messages.find((m) => m.id === 'client-disowned')?.text).toMatch(/contract is void/);
    expect(weaponBlocked(s, 'drone')).toBe('Client cut support');
    expect(weaponBlocked(s, 'sniper')).toBe('Client cut support');
    const w = wrapUp({ ...s, mission: { ...s.mission, phase: 'complete', blackBox: true } });
    expect(w.payout[0]).toEqual({ label: 'Contract (void: disowned)', amount: 0 });
    expect(w.reason).toMatch(/disowned the operation/);
    expect(w.budget).toBeLessThan(CONTRACT);
  });

  it('one loud moment is a warning, not a firing: it takes a second spike after the warning', () => {
    expect(loud(DISOWN_AT + 1).deniability).toBe('warned');
  });
});
