import { describe, expect, it } from 'vitest';
import { makeContact } from './contacts';
import type { GameState } from './state';
import { createStore } from './store';
import { walking } from './testkit';

// A found checkpoint in E3. (HQ paints nothing itself: ALPHA's laser does. ILI-1315 took out
// the Hold-and-watch that set it, so painting is set directly here.)
const facing = (): GameState => {
  const s = walking();
  return { ...s, contacts: [{ ...makeContact('cp', 'E3', 'a checkpoint', 1.6, [1, 5, 6, 9, 10]), status: 'revealed' }] };
};

describe('target painting', () => {
  it('painted, the war room strike sees every fighter', () => {
    const s = facing();
    const store = createStore({ ...s, contacts: s.contacts.map((c) => ({ ...c, painted: true })) });
    const units = store.get().contacts[0].units;
    store.fire('cp', 'sniper');
    expect(store.get().sniper!.shots.map((x) => x.unit).sort()).toEqual([...units].sort().slice(0, store.get().sniper!.shots.length)); // OVERWATCH aims at all of them
    expect(store.get().sniper!.shots.every((x) => x.hit)).toBe(true);
  });

  it('unpainted and unseen, the sniper can’t aim; the drone still flies', () => {
    const store = createStore(facing());
    store.fire('cp', 'sniper');
    expect(store.get().minigame).toBeNull();
    store.fire('cp', 'drone');
    expect(store.get().minigame).toBeNull(); // no board: REAPER-1 is on its way (ILI-1252)
    expect(store.get().drone).toMatchObject({ kills: null });
  });
});
