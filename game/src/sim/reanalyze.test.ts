import { describe, expect, it } from 'vitest';
import type { GameState } from './state';
import { analyzable, reopen, reopened, settled } from './intel';
import { fed, lockedStore, walking } from './testkit';

// A square analyzed, with a checkpoint HQ can strike in it.
const analyzedE3 = (): GameState => {
  const s = fed({ ...walking(), elapsedMs: 100_000 });
  const units = [0, 3, 5];
  return {
    ...s,
    intel: { ...s.intel, graded: ['E3'] },
    contacts: [{ id: 't', square: 'E3', label: 'a checkpoint', strength: 1, status: 'revealed', observed: false, units, total: units.length }],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'A checkpoint', atMs: 0, status: 'seen' }],
    imagery: { E3: { square: 'E3', atMs: s.elapsedMs, mode: 'photo', live: false, seen: [{ contactId: 't', x: 800, y: 400, units, to: null, awareness: 'unaware' }] } },
  };
};

describe('Analyze again after an action (ILI-1516)', () => {
  it('a settled square is spent for Analyze until HQ acts on it', () => {
    const s = analyzedE3();
    expect(settled(s, 'E3')).toBe(true);
    expect(analyzable(s, 'E3')).toBe(false);
    const acted = reopen(s, 'E3');
    expect(reopened(acted, 'E3')).toBe(true);
    expect(analyzable(acted, 'E3')).toBe(true);
    expect(settled(acted, 'E3')).toBe(true); // still known ground for ALPHA
    expect(reopen(s, 'A1')).toBe(s); // a square never analyzed has nothing to reopen
  });

  it('a strike on the square opens it, and a second Analyze settles it again', () => {
    const store = lockedStore(analyzedE3());
    store.fire('t', 'sniper');
    expect(store.get().sniper).toBeTruthy();
    expect(analyzable(store.get(), 'E3')).toBe(true);
    const before = store.get().intel.pushes.length;
    store.scan('E3');
    const s = store.get();
    expect(s.intel.pushes.length).toBeGreaterThan(before); // a fresh package on the shelf
    expect(s.intel.pushes.at(-1)).toMatchObject({ square: 'E3', state: 'posted' });
    expect(analyzable(s, 'E3')).toBe(false);
  });
});
