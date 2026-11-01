import { describe, expect, it } from 'vitest';
import { DEPLOY, ESCROW_BOX, PER_CALL } from './prices';
import { slewMs } from './satellite';
import { initialState } from './state';
import { createStore } from './store';
import { bankruptAt, escrow, perCall, UPGRADES } from './upgrades';
import { gauge, pushPhoto, pushVideo } from './intel';
import { run, walking } from './testkit';

// The store's upgrades (ILI-1317): each changes the game where it says, from the next mission.
const withUp = (...ids: string[]) => initialState(undefined, undefined, 0, [], ids);

describe('upgrades', () => {
  it('ten of them, in five groups, each with a price', () => {
    expect(UPGRADES).toHaveLength(10);
    expect(new Set(UPGRADES.map((u) => u.group)).size).toBe(5);
    expect(UPGRADES.every((u) => u.price > 0)).toBe(true);
  });

  it('lean deployment costs less up front', () => {
    expect(withUp('lean').resources.budget).toBe(-DEPLOY * 0.75);
  });

  it('more satellites: ORION-3 slews faster', () => {
    expect(slewMs(withUp('satellites'), 'A1')).toBeLessThan(slewMs(initialState(), 'A1'));
  });

  it('more analysts: a photo is worth more', () => {
    expect(gauge(pushPhoto(withUp('analysts'), 'B1', 0).next)).toBe(gauge(pushPhoto(initialState(), 'B1', 0).next) * 1.5);
  });

  it('a second video feed: video twice, the floor higher each time', () => {
    const once = pushVideo(withUp('video2'));
    expect(once.intel.videoUsed).toBe(false);
    const twice = pushVideo(once);
    expect(twice.intel.videoUsed).toBe(true);
    expect(gauge(twice)).toBeGreaterThan(gauge(once));
  });

  it('field hospital: more meds; training: faster on foot', () => {
    expect(withUp('medical').team.operators[0].meds).toBeGreaterThan(initialState().team.operators[0].meds);
    const fast = run({ ...walking(), upgrades: ['training'] }, 5_000);
    const slow = run(walking(), 5_000);
    const d = (s: typeof fast) => Math.hypot(s.team.position.x - walking().team.position.x, s.team.position.y - walking().team.position.y);
    expect(d(fast)).toBeGreaterThan(d(slow));
  });

  it('better rates, a bigger credit line, better clients', () => {
    const s = withUp('rates', 'credit', 'clients');
    expect(perCall(s, 'heli')).toBe(PER_CALL.heli * 0.75);
    expect(bankruptAt(s)).toBe(-6_000_000);
    expect(escrow(s, ESCROW_BOX)).toBe(ESCROW_BOX * 1.2);
  });

  it('a restart keeps what’s been bought', () => {
    const store = createStore(withUp('lean'));
    store.restart();
    expect(store.get().upgrades).toEqual(['lean']);
  });
});
