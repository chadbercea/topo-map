import { describe, expect, it } from 'vitest';
import { airGone, CROSS_MS, FLIGHT_MS, HELI_PASSES, LINGER_MS, TURN_MS } from './air';
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
    expect(s.resources.ledger.field).toBe(4 * CASH_PER_STRIKE_KILL); // the four HQ saw are confirmed
  });

  it('blind, it still clears the square, but nothing is confirmed or paid', () => {
    const store = createStore(e3(null));
    store.fire('t', 'drone');
    const s = run(store.get(), FLIGHT_MS + CROSS_MS + 200);
    expect(s.contacts.every((c) => c.status === 'cleared')).toBe(true);
    expect(s.resources.ledger.field).toBe(0);
    expect(s.comms.messages.at(-1)?.text).toBe('E3: all targets neutralized. 6 down. Unconfirmed: no eyes on it.');
  });

  it('its panel stays up a moment after the last kill, then goes; the X marks stay', () => {
    const store = createStore(e3());
    store.fire('t', 'drone');
    let s = run(store.get(), FLIGHT_MS + CROSS_MS + 200);
    expect(airGone(s.drone!, s.elapsedMs)).toBe(false);
    s = run(s, LINGER_MS);
    expect(airGone(s.drone!, s.elapsedMs)).toBe(true);
    expect(s.drone!.kills).toHaveLength(6); // the aftermath on the map
  });
});

describe('helicopter gun run (ILI-1254)', () => {
  it('comes in quicker, then strafes the rows HQ can see fighters in, turning back for each pass', () => {
    const store = createStore(e3());
    store.fire('t', 'heli');
    expect(store.get().heli).toMatchObject({ weapon: 'heli', square: 'E3', arriveMs: 100_000 + 6_000 });
    let s = run(store.get(), 6_100);
    const h = s.heli!;
    // Seen: cells 5, 6, 9, 10, rows 1 and 2. The hidden pair (3 and 12) is in rows 0 and 3.
    expect(h.passes!.map((p) => p.row)).toEqual([1, 2]);
    expect(h.passes!.map((p) => p.east)).toEqual([true, false]);
    expect(h.passes![1].startMs - h.passes![0].startMs).toBe(CROSS_MS + TURN_MS);
    s = run(s, 2 * (CROSS_MS + TURN_MS));
    expect(s.contacts[0].status).toBe('cleared'); // all four technicals were in those rows
    expect(s.contacts[1].units).toEqual([3, 12]); // the pair it couldn't see is untouched
    expect(s.comms.messages.at(-1)).toMatchObject({ from: 'HAMMER-2', text: `E3: 4 down, 2 still in there. +$${(4 * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` });
  });

  it(`at most ${HELI_PASSES} passes, the fullest rows first`, () => {
    const s0 = e3();
    const units = [0, 1, 4, 5, 6, 8, 12, 13, 14, 15];
    const store = createStore({
      ...s0,
      contacts: [{ ...s0.contacts[0], units, total: units.length }],
      imagery: { E3: { ...s0.imagery.E3, seen: [{ ...s0.imagery.E3.seen[0], units }] } },
    });
    store.fire('t', 'heli');
    const h = run(store.get(), 6_100).heli!;
    expect(h.passes!.map((p) => p.row)).toEqual([3, 1, 0]); // 4, 3 and 2 fighters; row 2 (one) is left
  });

  it('needs eyes on the target, and goes on cooldown', () => {
    const blind = createStore(e3(null));
    blind.fire('t', 'heli');
    expect(blind.get().heli).toBeNull();
    const store = createStore(e3());
    store.fire('t', 'heli');
    store.fire('t', 'heli');
    expect(store.get().heli!.launchedMs).toBe(100_000);
  });
});
