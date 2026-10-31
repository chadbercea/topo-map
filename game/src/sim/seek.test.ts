import { describe, expect, it } from 'vitest';
import { eyesOn } from './imagery';
import { WEAPON, weaponBlocked } from './ordnance';
import { PER_CALL } from './prices';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';
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

describe('ordnance', () => {
  it('drone, sniper and helicopter are all ready from the start (ILI-1254)', () => {
    const s = found();
    expect(weaponBlocked(s, 'drone', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'sniper', s.contacts[0])).toBeNull();
    expect(weaponBlocked(s, 'heli', s.contacts[0])).toBeNull();
  });

  it('the drone can be called again once it\u2019s back, at a price each time; the heli comes back after its cooldown', () => {
    const drone = createStore(found());
    const before = drone.get().resources.budget;
    drone.fire('t', 'drone');
    expect(drone.get().resources.budget).toBe(before - PER_CALL.drone); // every call costs (ILI-1316)
    expect(weaponBlocked(drone.get(), 'drone')).toMatch(/^Ready in/); // on its run
    drone.set(run(drone.get(), WEAPON.drone.runMs + 100));
    expect(weaponBlocked(drone.get(), 'drone')).toBeNull(); // no limit on calls
    const store = createStore(found());
    store.fire('t', 'heli');
    expect(weaponBlocked(store.get(), 'heli')).toMatch(/^Ready in \d+:\d\d$/); // ticking down, m:ss (ILI-1273)
    const ready = (x: ReturnType<typeof store.get>) => x.comms.messages.filter((m) => m.from === 'HAMMER-2' && m.id.startsWith('ready-'));
    store.set(run(store.get(), WEAPON.heli.runMs + WEAPON.heli.cooldownMs - 200));
    expect(ready(store.get())).toHaveLength(0);
    store.set(run(store.get(), 200));
    expect(weaponBlocked(store.get(), 'heli')).toBeNull();
    // ...and it says so, once (ILI-1273).
    expect(ready(store.get())).toHaveLength(1);
    expect(ready(run(store.get(), 5_000))).toHaveLength(1);
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

describe('targets', () => {
  it('fighters drift: one moves a cell every 33 s, so an old look stops matching', () => {
    const s = run(found(null), DRIFT_MS);
    const units = s.contacts[0].units;
    expect(units).toHaveLength(4);
    expect(units.filter((u) => [5, 6, 9, 10].includes(u))).toHaveLength(3);
  });
});
