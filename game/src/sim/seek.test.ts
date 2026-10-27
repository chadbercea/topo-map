import { describe, expect, it } from 'vitest';
import { eyesOn } from './imagery';
import { WEAPON, weaponBlocked } from './ordnance';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking, untilHold } from './testkit';

// The technicals in E3, found: four fighters in cells 5, 6, 9 and 10 of the 4x4 over the
// square. `look` is how old ORION-3's photo of them is (null: nobody has looked).
const found = (look: number | null = 0, extra: object = {}): GameState => {
  const s = { ...walking(), elapsedMs: 100_000 };
  const c = { id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed' as const, observed: false, units: [5, 6, 9, 10], total: 4, ...extra };
  return {
    ...s,
    contacts: [c],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'Two technicals', atMs: 0, status: 'seen' }],
    imagery:
      look === null
        ? {}
        : { E3: { square: 'E3', atMs: s.elapsedMs - look, mode: 'photo', live: false, seen: [{ contactId: 't', x: 800, y: 400, units: [5, 6, 9, 10], to: null, awareness: 'unaware' }] } },
  };
};

describe('ordnance', () => {
  it('drone and sniper are ready; the helicopter is locked until upgrades', () => {
    const s = found();
    expect(weaponBlocked(s, 'drone', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'sniper', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'heli', s.contacts[0])).toBe('Unlocks with upgrades');
  });

  it('the drone is one use; the sniper comes back after its cooldown', () => {
    const store = createStore(found());
    store.fire('t', 'drone');
    store.abortMiniGame();
    store.closeMiniGame();
    expect(weaponBlocked(store.get(), 'drone')).toBe('Used');
    store.fire('t', 'sniper');
    store.abortMiniGame();
    store.closeMiniGame();
    expect(weaponBlocked(store.get(), 'sniper')).toMatch(/^Ready in \d+ min$/);
    store.set(run(store.get(), WEAPON.sniper.runMs + WEAPON.sniper.cooldownMs));
    expect(weaponBlocked(store.get(), 'sniper')).toBeNull();
  });
});

describe('eyes on the target', () => {
  it('no look, or a stale one: the sniper can’t aim, the drone can still guess', () => {
    for (const s of [found(null), found(70_000)]) {
      expect(weaponBlocked(s, 'sniper', s.contacts[0])).toBe('No eyes on target');
      expect(weaponBlocked(s, 'drone', s.contacts[0])).toBeNull();
    }
  });

  it('how good the eyes are: fresh, ghost, stale, and live while painted', () => {
    expect(eyesOn(found(5_000), found().contacts[0])?.level).toBe('fresh');
    expect(eyesOn(found(30_000), found().contacts[0])?.level).toBe('ghost');
    expect(eyesOn(found(70_000), found().contacts[0])?.level).toBe('stale');
    const painted = found(null, { painted: true });
    expect(eyesOn(painted, painted.contacts[0])).toMatchObject({ level: 'live', units: [5, 6, 9, 10] });
    expect(eyesOn(found(null), found(null).contacts[0])).toBeNull();
  });
});

describe('strike', () => {
  it('firing opens the square with the fighters HQ has seen', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    expect(store.get().minigame).toMatchObject({ kind: 'seekDestroy', square: 'E3', weapon: 'sniper', roundsLeft: 8, status: 'active', eyes: 'fresh', spotted: [5, 6, 9, 10] });
  });

  it('sniper: a shot at a fighter you can see is a kill; the rest scatter to cover', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    store.tapMiniGame('E3', 5);
    const s = store.get();
    expect(s.minigame!.hits).toBe(1);
    expect(s.contacts[0].units).toHaveLength(3);
    expect(s.contacts[0].units).not.toEqual([6, 9, 10]); // they moved
    expect(s.minigame!.spotted).toEqual([6, 9, 10]); // HQ's picture still shows where they were
    expect(s.imagery.E3.seen[0].units).toEqual([6, 9, 10]); // the kill is confirmed
    store.tapMiniGame('E3', 6); // still cycling: ignored
    expect(store.get().minigame!.roundsLeft).toBe(7);
  });

  it('drone: one 2x2 blast; here it catches all four and the target is destroyed', () => {
    const store = createStore(found());
    store.fire('t', 'drone');
    store.tapMiniGame('E3', 5); // covers 5, 6, 9, 10
    const s = store.get();
    expect(s.minigame!.status).toBe('won');
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.events[0].status).toBe('resolved');
    expect(s.comms.messages.at(-1)).toMatchObject({ from: 'REAPER-1', text: 'E3: target destroyed. 4 down. +$6,000.' });
  });

  it('a blind drone strike still kills, but nobody saw it: no pay, and the picture is not updated', () => {
    const store = createStore(found(null));
    const budget = store.get().resources.budget;
    store.fire('t', 'drone');
    expect(store.get().minigame!.eyes).toBeNull();
    store.tapMiniGame('E3', 0); // covers 0, 1, 4, 5
    expect(store.get().contacts[0].units).toHaveLength(3);
    expect(store.get().resources.budget).toBe(budget);
    expect(store.get().comms.messages.at(-1)?.text).toBe('E3: 1 down, 3 still in there. Unconfirmed: no eyes on it.');
  });

  it('heli: a gun run strafes the whole row', () => {
    const store = createStore({ ...found(), ordnance: { ...found().ordnance, heli: { unlocked: true, uses: null, readyAtMs: 0 } } });
    store.fire('t', 'heli');
    store.tapMiniGame('E3', 4); // row 4-7 catches 5 and 6
    expect(store.get().minigame!.hits).toBe(2);
  });

  it('taps outside the target square do nothing', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    store.tapMiniGame('D3', 5);
    expect(store.get().minigame!.roundsLeft).toBe(8);
  });

  it('fighters drift: one moves a cell every 20 s, so an old look stops matching', () => {
    const s = run(found(null), 20_000);
    const units = s.contacts[0].units;
    expect(units).toHaveLength(4);
    expect(units.filter((u) => [5, 6, 9, 10].includes(u))).toHaveLength(3);
  });

  it('send ALPHA in answers the contact call with an attack', () => {
    const store = createStore({ ...found(), elapsedMs: 0 });
    store.set(untilHold(store.get())); // ALPHA reaches F4 and holds short of E3
    expect(store.get().team.holdFor).toBe('contact-call-t');
    store.sendTeam('t');
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().team.decisions.E3).toBe('attack');
  });
});
