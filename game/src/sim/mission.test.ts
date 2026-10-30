import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { RECOVER_MS } from './mission';
import type { GameState } from './state';
import { createStore } from './store';
import { answer, run, walking } from './testkit';

const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 600_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};

describe('mission A to B to C', () => {
  it('A is the infil, B the crash site, C the exfil', () => {
    expect(walking().mission).toMatchObject({ a: 'G5', b: 'D3', c: 'B1', phase: 'infil', blackBox: false });
  });

  it('at B the team holds to pull the black box, then heads for C', () => {
    let s = until(walking(), (x) => x.mission.phase === 'objective');
    expect(s.team.activity).toBe('Recovering the black box at D3');
    expect(s.team.position).toEqual(squareCenter('D3')); // at the wreck, not the square's edge
    const at = s.team.position;
    s = run(s, RECOVER_MS - 500);
    expect(s.team.position).toEqual(at);
    expect(s.mission.blackBox).toBe(false);
    s = run(s, 1_000);
    expect(s.mission).toMatchObject({ phase: 'exfil', blackBox: true });
    expect(s.comms.messages.some((m) => m.id === 'got-black-box')).toBe(true);
  });

  it('reaching C with the black box completes the mission and ends it', () => {
    const s = until(walking(), (x) => x.phase === 'ended');
    expect(s.mission.phase).toBe('complete');
    expect(s.team.position).toEqual(squareCenter('B1'));
    expect(s.comms.messages.at(-1)?.text).toMatch(/We're out/);
  });

  it('the crash site cannot be detoured around', () => {
    const s0 = walking();
    const s = {
      ...s0,
      contacts: [{ id: 'x', square: 'D3', label: 'a squad', strength: 1, status: 'revealed' as const, observed: false, units: [0], total: 1 }],
    };
    const store = createStore(until(s, (x) => x.team.holdFor === 'contact-call-x'));
    answer(store, 'contact-call-x', 'avoid');
    expect(store.get().team.route).toContain('D3');
    expect(store.get().team.decisions.D3).toBe('push');
  });
});
