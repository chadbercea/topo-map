import { describe, expect, it } from 'vitest';
import { dice, FIRST_TX_MS, trafficSystem } from './enemy';
import { convoyComes } from './missions/blackBox';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { fed, run, untilTraffic } from './testkit';

// The enemy plays by rules and the mission's seeded dice, not a script (ILI-1454).
const seeded = (seed: number): GameState => {
  const s = fed(initialState());
  // Every square known, so ALPHA walks on and the fight dice get used along the way.
  return { ...s, seed, rng: seed, map: { ...s.map, scanned: [...s.team.route] } };
};

// What happened, and when: every map event and radio line, where each group ended up, and ALPHA.
const timeline = (s: GameState) => ({
  events: s.events.map((e) => `${e.atMs} ${e.kind} ${e.id} ${e.square} ${e.status}`),
  radio: s.comms.messages.map((m) => `${m.atMs} ${m.from} ${m.id} ${m.text}`),
  contacts: s.contacts.map((c) => `${c.id} ${c.square} ${c.status} ${c.units.join(',')}`),
  team: s.team.operators.map((o) => `${o.id} ${o.health} ${o.ammo}`),
});

// A whole mission, HQ answering nothing, until the clock runs out.
const play = (seed: number) => run(seeded(seed), 600_000);

describe('a mission replays exactly (ILI-1454)', () => {
  it('the same seed gives the same events, radio and fights, to the tick', () => {
    const a = timeline(play(1234));
    const b = timeline(play(1234));
    expect(a.events.some((e) => e.includes(' signal '))).toBe(true);
    expect(a).toEqual(b);
  });

  it('a different seed plays out differently', () => {
    expect(timeline(play(1234)).events).not.toEqual(timeline(play(99)).events);
  });

  it('the dice: the same seed and key, the same number, 0 to 1', () => {
    expect(dice(7, 'convoy')).toBe(dice(7, 'convoy'));
    expect(dice(7, 'convoy')).not.toBe(dice(8, 'convoy'));
    for (let seed = 0; seed < 200; seed++) {
      expect(dice(seed, 'x')).toBeGreaterThanOrEqual(0);
      expect(dice(seed, 'x')).toBeLessThan(1);
    }
  });

  it('a restart keeps the seed; setSeed plays another', () => {
    const store = createStore(initialState());
    store.setSeed(42);
    expect(store.get()).toMatchObject({ seed: 42, rng: 42 });
    store.restart();
    expect(store.get()).toMatchObject({ seed: 42, rng: 42 });
  });
});

describe('enemy radio traffic is a rule, not a script (ILI-1454)', () => {
  it('a live group talks on its net, at its own square, early in the mission whatever the seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = untilTraffic({ ...initialState(), seed, rng: seed });
      const e = s.events.find((x) => x.kind === 'signal')!;
      expect(s.elapsedMs).toBeLessThanOrEqual(FIRST_TX_MS[1] + 100);
      expect(s.contacts.some((c) => c.square === e.square && c.status === 'hidden')).toBe(true);
    }
  });

  it('on the default seed the patrol at C2 is first, inside a minute and a half', () => {
    const s = untilTraffic(initialState());
    expect(s.elapsedMs).toBeLessThan(90_000);
    expect(s.events.find((e) => e.kind === 'signal')?.square).toBe('C2');
  });

  it('one net: while traffic is up and unanswered, nobody else comes up', () => {
    const s = run(untilTraffic(initialState()), 300_000);
    expect(s.events.filter((e) => e.kind === 'signal')).toHaveLength(1);
  });

  // Every transmission answered the moment it comes up: how many in ten minutes.
  const transmissions = (alerted: boolean) => {
    let s: GameState = { ...initialState(), alerted };
    let n = 0;
    for (let t = 0; t < 600_000; t += 100) {
      s = trafficSystem({ ...s, elapsedMs: s.elapsedMs + 100 }, 100);
      const open = s.events.find((e) => e.kind === 'signal' && e.status === 'new');
      if (!open) continue;
      n++;
      s = { ...s, events: s.events.map((e) => (e === open ? { ...e, status: 'resolved' as const } : e)) };
    }
    return n;
  };

  it('answered, the net carries on: more traffic comes, and faster once the enemy is alerted', () => {
    expect(transmissions(false)).toBeGreaterThan(3);
    expect(transmissions(true)).toBeGreaterThan(transmissions(false));
  });

  it('no live groups, no traffic', () => {
    const s0 = initialState();
    const s = run({ ...s0, contacts: s0.contacts.map((c) => ({ ...c, status: 'cleared' as const })) }, 300_000);
    expect(s.events.some((e) => e.kind === 'signal')).toBe(false);
  });
});

describe('the salvage convoy comes on the dice (ILI-1454)', () => {
  it('on most seeds, not all; the default seed has it', () => {
    expect(convoyComes(initialState().seed)).toBe(true);
    const comes = Array.from({ length: 200 }, (_, seed) => convoyComes(seed)).filter(Boolean).length;
    expect(comes).toBeGreaterThan(100);
    expect(comes).toBeLessThan(200);
  });
});
