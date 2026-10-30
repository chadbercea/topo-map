import { describe, expect, it } from 'vitest';
import { eyesOn } from './imagery';
import { WEAPON, weaponBlocked } from './ordnance';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking, untilHold } from './testkit';
import { LINK_MS } from './comms';
import { DRIFT_MS } from './contacts';

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

// The heli unlocked: the one weapon left with a board to aim on.
const HELI = (): GameState => ({ ...found(), ordnance: { ...found().ordnance, heli: { unlocked: true, uses: null, readyAtMs: 0 } } });

describe('ordnance', () => {
  it('drone and sniper are ready; the helicopter is locked until upgrades', () => {
    const s = found();
    expect(weaponBlocked(s, 'drone', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'sniper', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'heli', s.contacts[0])).toBe('Unlocks with upgrades');
  });

  it('the drone is one use; the heli comes back after its cooldown', () => {
    const drone = createStore(found());
    drone.fire('t', 'drone');
    expect(weaponBlocked(drone.get(), 'drone')).toBe('Used');
    const store = createStore(HELI());
    store.fire('t', 'heli');
    store.abortMiniGame();
    expect(weaponBlocked(store.get(), 'heli')).toMatch(/^Ready in /);
    store.set(run(store.get(), WEAPON.heli.runMs + WEAPON.heli.cooldownMs));
    expect(weaponBlocked(store.get(), 'heli')).toBeNull();
  });
});

describe('eyes on the target', () => {
  it('no look, or a stale one: the sniper can’t aim, the drone can still guess', () => {
    for (const s of [found(null), found(110_000)]) {
      expect(weaponBlocked(s, 'sniper', s.contacts[0])).toBe('No eyes on target');
      expect(weaponBlocked(s, 'drone', s.contacts[0])).toBeNull();
    }
  });

  it('how good the eyes are: fresh, ghost, stale, and live while painted', () => {
    expect(eyesOn(found(5_000), found().contacts[0])?.level).toBe('fresh');
    expect(eyesOn(found(50_000), found().contacts[0])?.level).toBe('ghost');
    expect(eyesOn(found(110_000), found().contacts[0])?.level).toBe('stale');
    const painted = found(null, { painted: true });
    expect(eyesOn(painted, painted.contacts[0])).toMatchObject({ level: 'live', units: [5, 6, 9, 10] });
    expect(eyesOn(found(null), found(null).contacts[0])).toBeNull();
  });
});

describe('strike', () => {
  it('firing the heli opens the square with the fighters HQ has seen', () => {
    const store = createStore(HELI());
    store.fire('t', 'heli');
    expect(store.get().minigame).toMatchObject({ kind: 'seekDestroy', square: 'E3', weapon: 'heli', roundsLeft: 3, status: 'active', eyes: 'fresh', spotted: [5, 6, 9, 10] });
  });

  it('heli: a gun run strafes the whole row', () => {
    const store = createStore(HELI());
    store.fire('t', 'heli');
    store.tapMiniGame('E3', 4); // row 4-7 catches 5 and 6
    expect(store.get().minigame!.hits).toBe(2);
  });

  it('taps outside the target square do nothing', () => {
    const store = createStore(HELI());
    store.fire('t', 'heli');
    store.tapMiniGame('D3', 5);
    expect(store.get().minigame!.roundsLeft).toBe(3);
  });

  it('fighters drift: one moves a cell every 33 s, so an old look stops matching', () => {
    const s = run(found(null), DRIFT_MS);
    const units = s.contacts[0].units;
    expect(units).toHaveLength(4);
    expect(units.filter((u) => [5, 6, 9, 10].includes(u))).toHaveLength(3);
  });

  it('send ALPHA in answers the contact call with an attack', () => {
    const store = createStore({ ...found(), elapsedMs: 0 });
    store.set(untilHold(store.get())); // ALPHA reaches F4 and holds short of E3
    expect(store.get().team.holdFor).toBe('contact-call-t');
    store.sendTeam('t');
    store.tick(LINK_MS);
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().team.decisions.E3).toBe('attack');
  });
});
