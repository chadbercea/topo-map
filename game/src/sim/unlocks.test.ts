import { describe, expect, it } from 'vitest';
import { unlockBlocked, unlockedWeapons, weaponBlocked } from './ordnance';
import { DEPLOY, UNLOCK } from './prices';
import { initialState, type GameState } from './state';
import { createStore } from './store';

// Capabilities (ILI-1316): none to start; bought in order, sniper, drone, heli, once the balance
// covers each; then every call costs.
const withBalance = (budget: number): GameState => {
  const s = initialState();
  return { ...s, resources: { ...s.resources, budget } };
};

describe('capability unlocks', () => {
  it('a new PMC starts with nothing: every strike is locked', () => {
    const s = initialState();
    expect(unlockedWeapons(s)).toEqual([]);
    expect(weaponBlocked(s, 'sniper')).toBe('Locked');
  });

  it('in the red nothing can be bought; in the green the sniper first, then the drone, then the heli', () => {
    expect(unlockBlocked(initialState(), 'sniper')).toBe('Needs the balance in the green'); // −$400k at the start
    const rich = withBalance(5_000_000);
    expect(unlockBlocked(rich, 'sniper')).toBeNull();
    expect(unlockBlocked(rich, 'drone')).toBe('After the sniper');
    const store = createStore(rich);
    store.unlock('sniper');
    expect(store.get().ordnance.sniper.unlocked).toBe(true);
    expect(store.get().resources.budget).toBe(5_000_000 - UNLOCK.sniper);
    store.unlock('drone');
    store.unlock('heli');
    expect(unlockedWeapons(store.get())).toEqual(['drone', 'sniper', 'heli']);
  });

  it('it has to cover the price: a balance short of it can’t buy', () => {
    expect(unlockBlocked(withBalance(UNLOCK.sniper - 1), 'sniper')).toBe('Needs the balance in the green');
  });

  it('a mission opens with the capabilities carried in', () => {
    const s = initialState(undefined, undefined, 1_000_000, ['sniper']);
    expect(unlockedWeapons(s)).toEqual(['sniper']);
    expect(s.resources.budget).toBe(1_000_000 - DEPLOY);
  });
});
