import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { LOOT } from './missions/blackBox';
import type { GameState } from './state';
import { createStore } from './store';
import { answer, run, walking } from './testkit';

// The salvage convoy that cuts the exfil (ILI-1192): clear ground, the convoy left in.
const toTheConvoy = () => {
  const s0 = walking();
  let s: GameState = { ...s0, script: { ...s0.script, fired: s0.script.fired.filter((f) => f !== 'convoy-on-exfil') } };
  for (let t = 0; t < 600_000 && s.team.holdFor !== 'exfil-cut'; t += 100) s = run(s, 100);
  return createStore(s);
};
const until = (s: GameState, done: (x: GameState) => boolean) => {
  for (let t = 0; t < 600_000 && !done(s); t += 100) s = run(s, 100);
  return s;
};

describe('the salvage convoy on the exfil (ILI-1192)', () => {
  it('pulls onto the exfil once the black box is out, and ALPHA holds and asks', () => {
    const s = toTheConvoy().get();
    expect(s.mission).toMatchObject({ phase: 'exfil', blackBox: true });
    expect(s.contacts.find((c) => c.id === 'convoy')).toMatchObject({ square: 'B1', status: 'revealed' });
    const call = s.comms.messages.find((m) => m.id === 'exfil-cut')!;
    expect(call.text).toContain('salvage convoy');
    expect(call.responses?.map((r) => r.label)).toEqual(['Hit the convoy', 'Move exfil']);
    expect(s.events.some((e) => e.id === 'contact-convoy' && e.square === 'B1')).toBe(true);
  });

  it('move exfil: ALPHA swings wide to A2 and gets out there, about 3.5 km all told', () => {
    const store = toTheConvoy();
    answer(store, 'exfil-cut', 'divert');
    expect(store.get().mission.c).toBe('A2');
    expect(store.get().team.route.slice(-3)).toEqual(['C2', 'B2', 'A2']);
    // Clear ground to the new exfil, for the walk.
    const s0 = store.get();
    const s = until({ ...s0, map: { ...s0.map, scanned: [...s0.map.scanned, 'B2', 'A2'] } }, (x) => x.phase === 'ended');
    expect(s.mission.phase).toBe('complete');
    expect(s.team.position).toEqual(squareCenter('A2'));
    expect(s.contacts.find((c) => c.id === 'convoy')?.status).toBe('revealed'); // left alone
  });

  it('hit the convoy: ALPHA fights for it, takes the haul, and exfils at B1', () => {
    const store = toTheConvoy();
    const before = store.get().resources.budget;
    answer(store, 'exfil-cut', 'engage');
    const s = until(store.get(), (x) => x.phase === 'ended');
    expect(s.contacts.find((c) => c.id === 'convoy')?.status).toBe('cleared');
    expect(s.comms.messages.some((m) => m.id === 'convoy-loot')).toBe(true);
    expect(s.resources.budget).toBeGreaterThanOrEqual(before + LOOT);
    expect(s.mission.c).toBe('B1');
  });
});
