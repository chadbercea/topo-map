import { describe, expect, it } from 'vitest';
import { dice, hearTraffic, heardTraffic } from './enemy';
import { convoyComes } from './missions/blackBox';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { fed, lockOn, run } from './testkit';

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
    expect(a).toEqual(b);
  });

  it('a different seed plays out differently', () => {
    expect(timeline(play(1234))).not.toEqual(timeline(play(99)));
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

describe('enemy radio traffic is a reward of scanning, not a timer (ILI-1359)', () => {
  // Scan a square with ORION-3 over it, on a given seed: the state once the capture is done.
  const scanned = (seed: number, square: string) => {
    const store = createStore(lockOn({ ...fed(initialState()), seed, rng: seed }, square));
    store.scan(square);
    for (let i = 0; i < 200 && store.get().satellite.state === 'capturing'; i++) store.tick(100);
    return store.get();
  };
  const heard = (s: GameState) => heardTraffic(s.intel.pushes.at(-1)?.items);

  it('nothing comes up by itself: ten minutes without a scan, no traffic', () => {
    expect(run(initialState(), 600_000).events.some((e) => e.kind === 'signal')).toBe(false);
  });

  it('a scan whose SIGINT report heard something brings their traffic up on that square; one that did not, nothing', () => {
    let yes = 0;
    let no = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = scanned(seed, 'C2');
      const e = s.events.find((x) => x.kind === 'signal');
      if (heard(s)) {
        yes++;
        expect(e?.square).toBe('C2');
      } else {
        no++;
        expect(e).toBeUndefined();
      }
    }
    expect(yes).toBeGreaterThan(0); // a variable reward: some scans, not all
    expect(no).toBeGreaterThan(0);
  });

  it('no HQ call pops up for it: the traffic is a tag on the square', () => {
    const s = hearTraffic(initialState(), 'C2');
    expect(s.events.filter((e) => e.kind === 'signal')).toHaveLength(1);
    expect(s.comms.messages.some((m) => /radio traffic/i.test(m.text))).toBe(false);
  });

  it('one net: while traffic is up, nothing new; jammed or nobody left, nothing at all', () => {
    const s0 = initialState();
    expect(hearTraffic(hearTraffic(s0, 'C2'), 'D3').events.filter((e) => e.kind === 'signal')).toHaveLength(1);
    expect(hearTraffic({ ...s0, flags: { ...s0.flags, jammed: true } }, 'C2').events.some((e) => e.kind === 'signal')).toBe(false);
    expect(hearTraffic({ ...s0, contacts: s0.contacts.map((c) => ({ ...c, status: 'cleared' as const })) }, 'C2').events.some((e) => e.kind === 'signal')).toBe(false);
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
