import { describe, expect, it } from 'vitest';
import type { GameState } from './state';
import { fed, lockOn, lockedStore, walking } from './testkit';
import { alertSquares, strikeBlocked } from './strike';
import { satName } from './satellite';

// Technicals HQ photographed in E3 (`look` ms ago; null: nobody has looked), E3 analyzed.
const e3 = (look: number | null = 0): GameState => {
  const s = fed({ ...walking(), elapsedMs: 100_000 });
  return {
    ...s,
    intel: { ...s.intel, graded: [...s.intel.graded, 'E3'] },
    contacts: [{ id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed: false, units: [5, 6, 9, 10], total: 4 }],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'Two technicals', atMs: 0, status: 'seen' }],
    imagery:
      look === null
        ? {}
        : { E3: { square: 'E3', atMs: s.elapsedMs - look, mode: 'photo', live: false, seen: [{ contactId: 't', x: 800, y: 400, units: [5, 6, 9, 10], to: null, awareness: 'unaware' }] } },
  };
};

describe('the ALERT (ILI-1524)', () => {
  it('shows on a square with fighters HQ has found, and only on ground ORION-3 has analyzed', () => {
    expect(alertSquares(e3())).toEqual(['E3']);
    const unseen = e3();
    expect(alertSquares({ ...unseen, intel: { ...unseen.intel, graded: [] } })).toEqual([]);
  });

  it('goes once the contact is dealt with, but stays while a strike is still working the square', () => {
    const store = lockedStore(e3());
    store.fire('t', 'drone');
    const s = store.get();
    expect(s.drone?.square).toBe('E3');
    const resolved = { ...s, events: s.events.map((e) => ({ ...e, status: 'resolved' as const })) };
    expect(alertSquares(resolved)).toEqual(['E3']);
    expect(alertSquares({ ...resolved, drone: null })).toEqual([]);
  });

  it('never clicks dead: every weapon says why it cannot fire', () => {
    const s = e3();
    const c = s.contacts[0];
    // ORION-3 isn't over the square: every weapon says so.
    expect(strikeBlocked(s, 'drone', c)).toBe(`${satName(s)} not over E3`);
    // Over it, with a current look: all three can go.
    const over = lockOn(s, 'E3');
    expect(['drone', 'sniper', 'heli'].map((w) => strikeBlocked(over, w as 'drone', c))).toEqual([null, null, null]);
    // No look: the drone can fire blind, the others need eyes on.
    const blind = lockOn(e3(null), 'E3');
    expect(strikeBlocked(blind, 'drone', c)).toBeNull();
    expect(strikeBlocked(blind, 'sniper', c)).toBe('No eyes on target');
    // Not bought: says so first.
    expect(strikeBlocked({ ...over, ordnance: { ...over.ordnance, heli: { ...over.ordnance.heli, unlocked: false } } }, 'heli', c)).toBe('Locked');
  });

  it('a second strike waits until the first is done with the square', () => {
    const store = lockedStore(e3());
    store.fire('t', 'drone');
    expect(strikeBlocked(store.get(), 'sniper', store.get().contacts[0])).toBe('Strike under way');
  });
});
