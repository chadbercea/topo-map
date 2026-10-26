import { describe, expect, it } from 'vitest';
import { WEAPON, weaponBlocked } from './ordnance';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// The technicals in E3, found: four fighters in cells 5, 6, 9 and 10 of the 4x4 board.
const found = (observed = false): GameState => {
  const s = walking();
  return {
    ...s,
    contacts: [{ id: 't', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed, units: [5, 6, 9, 10], total: 4 }],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'Two technicals', atMs: 0, status: 'seen' }],
  };
};

describe('ordnance', () => {
  it('drone and sniper are ready; the helicopter is locked until upgrades', () => {
    const s = found();
    expect(weaponBlocked(s, 'drone')).toBeNull();
    expect(weaponBlocked(s, 'sniper')).toBeNull();
    expect(weaponBlocked(s, 'heli')).toBe('Unlocks with upgrades');
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
    expect(weaponBlocked(store.get(), 'sniper')).toMatch(/^Ready in \d+s$/);
    store.set(run(store.get(), WEAPON.sniper.runMs + WEAPON.sniper.cooldownMs));
    expect(weaponBlocked(store.get(), 'sniper')).toBeNull();
  });
});

describe('seek and destroy', () => {
  it('firing turns the target square into a board', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    expect(store.get().minigame).toMatchObject({ kind: 'seekDestroy', square: 'E3', weapon: 'sniper', roundsLeft: 8, status: 'active' });
  });

  it('sniper: one round per tap, slow to cycle; a hit is a kill', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    store.tapMiniGame('E3', 5);
    expect(store.get().contacts[0].units).toEqual([6, 9, 10]);
    expect(store.get().minigame!.hits).toBe(1);
    store.tapMiniGame('E3', 6); // still cycling: ignored
    expect(store.get().minigame!.roundsLeft).toBe(7);
    store.set(run(store.get(), WEAPON.sniper.cycleMs));
    store.tapMiniGame('E3', 0); // a miss
    expect(store.get().minigame!.shots!.at(-1)).toMatchObject({ cell: 0, hit: false });
    expect(store.get().minigame!.roundsLeft).toBe(6);
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

  it('a partial result weakens the contact for the fight that follows', () => {
    const store = createStore(found());
    store.fire('t', 'drone');
    store.tapMiniGame('E3', 0); // only covers 0, 1, 4, 5
    expect(store.get().minigame!.status).toBe('lost');
    expect(store.get().contacts[0].units).toEqual([6, 9, 10]);
    expect(store.get().comms.messages.at(-1)?.text).toBe('E3: 1 down, 3 still in there. +$1,500.');
  });

  it('taps outside the target square do nothing', () => {
    const store = createStore(found());
    store.fire('t', 'sniper');
    store.tapMiniGame('D3', 5);
    expect(store.get().minigame!.roundsLeft).toBe(8);
  });

  it('an observed contact shows one fighter already spotted', () => {
    const store = createStore(found(true));
    store.fire('t', 'sniper');
    expect(store.get().minigame!.spotted).toEqual([5]);
  });

  it('send ALPHA in answers the contact call with an attack', () => {
    const store = createStore(found());
    store.set(run(store.get(), 30_000)); // ALPHA reaches F4 and holds short of E3
    expect(store.get().team.holdFor).toBe('contact-call-t');
    store.sendTeam('t');
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().team.decisions.E3).toBe('attack');
  });
});
