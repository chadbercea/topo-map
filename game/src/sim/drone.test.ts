import { describe, expect, it } from 'vitest';
import { CROSS_MS, droneGone, FLIGHT_MS, LINGER_MS } from './drone';
import { CASH_PER_STRIKE_KILL } from './sites';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// Two groups in E3: technicals HQ photographed (cells 5, 6, 9, 10) and a hidden pair nobody has
// seen (cells 3 and 12). `look` is how old the photo is (null: nobody has looked).
const e3 = (look: number | null = 0): GameState => {
  const s = { ...walking(), elapsedMs: 100_000 };
  return {
    ...s,
    contacts: [
      { id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed: false, units: [5, 6, 9, 10], total: 4 },
      { id: 'h', square: 'E3', label: 'a pair', strength: 0.5, status: 'hidden', observed: false, units: [3, 12], total: 2 },
    ],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'Two technicals', atMs: 0, status: 'seen' }],
    imagery:
      look === null
        ? {}
        : { E3: { square: 'E3', atMs: s.elapsedMs - look, mode: 'photo', live: false, seen: [{ contactId: 't', x: 800, y: 400, units: [5, 6, 9, 10], to: null, awareness: 'unaware' }] } },
  };
};

describe('drone strike (ILI-1252)', () => {
  it('flies in on a countdown: nothing happens until it reaches the square', () => {
    const store = createStore(e3());
    store.fire('t', 'drone');
    expect(store.get().minigame).toBeNull(); // no board to aim on
    expect(store.get().drone).toMatchObject({ square: 'E3', arriveMs: 100_000 + FLIGHT_MS, kills: null });
    const s = run(store.get(), FLIGHT_MS - 200);
    expect(s.contacts[0].units).toHaveLength(4);
    expect(s.drone!.kills).toBeNull();
  });

  it('crossing west to east, it takes out every fighter in the square, nearest first', () => {
    const store = createStore(e3());
    store.fire('t', 'drone');
    let s = run(store.get(), FLIGHT_MS + 100);
    const kills = s.drone!.kills!;
    expect(kills).toHaveLength(6); // the hidden pair too
    expect(kills.map((k) => k.x)).toEqual([...kills.map((k) => k.x)].sort((a, b) => a - b));
    expect(kills.every((k, i) => i === 0 || k.atMs >= kills[i - 1].atMs)).toBe(true);
    // Partway over, only the ones it has passed are down.
    s = run(s, CROSS_MS / 2);
    const down = kills.filter((k) => k.atMs <= s.elapsedMs).length;
    expect(down).toBeGreaterThan(0);
    expect(down).toBeLessThan(6);
    s = run(s, CROSS_MS);
    expect(s.contacts.map((c) => c.status)).toEqual(['cleared', 'cleared']);
    expect(s.events.find((e) => e.id === 'contact-t')?.status).toBe('resolved');
    expect(s.events.some((e) => e.kind === 'site' && e.square === 'E3')).toBe(true);
    expect(s.comms.messages.at(-1)).toMatchObject({ from: 'REAPER-1', text: `E3: all targets neutralized. 6 down. +$${(4 * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` });
    expect(s.resources.budget).toBe(4 * CASH_PER_STRIKE_KILL); // the four HQ saw are confirmed
  });

  it('blind, it still clears the square, but nothing is confirmed or paid', () => {
    const store = createStore(e3(null));
    store.fire('t', 'drone');
    const s = run(store.get(), FLIGHT_MS + CROSS_MS + 200);
    expect(s.contacts.every((c) => c.status === 'cleared')).toBe(true);
    expect(s.resources.budget).toBe(0);
    expect(s.comms.messages.at(-1)?.text).toBe('E3: all targets neutralized. 6 down. Unconfirmed: no eyes on it.');
  });

  it('its panel stays up a moment after the last kill, then goes; the X marks stay', () => {
    const store = createStore(e3());
    store.fire('t', 'drone');
    let s = run(store.get(), FLIGHT_MS + CROSS_MS + 200);
    expect(droneGone(s.drone!, s.elapsedMs)).toBe(false);
    s = run(s, LINGER_MS);
    expect(droneGone(s.drone!, s.elapsedMs)).toBe(true);
    expect(s.drone!.kills).toHaveLength(6); // the aftermath on the map
  });
});
