import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { hasBuff, ready } from './intel';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};

describe('intel pipeline', () => {
  it('picks up intel as it comes in, one project per type', () => {
    let s = step(initialState(), 100);
    expect(s.intel.projects.imagery?.title).toBe('Route overwatch');
    expect(s.intel.projects.signals).toBeNull();
    s = run(s, 20_000);
    expect(s.intel.projects.signals?.title).toBe('Radio chatter');
    s = run(s, 20_000);
    expect(s.intel.projects.target?.title).toBe('Checkpoint photos');
  });

  it('progresses with analyst time and finishes on schedule', () => {
    const s = run(initialState(), 20_000);
    expect(s.intel.projects.imagery!.progress).toBeCloseTo(0.5, 1);
    expect(ready(run(s, 20_100).intel.projects.imagery)).toBe(true);
  });

  it('more analysts work faster', () => {
    const base = initialState();
    const more = { ...base, intel: { ...base.intel, analysts: 6 } };
    expect(run(more, 10_000).intel.projects.imagery!.progress).toBeCloseTo(2 * run(base, 10_000).intel.projects.imagery!.progress, 5);
  });

  it('a mini game win jumps its type ahead', () => {
    const store = createStore(step(initialState(), 100));
    store.boostIntel('imagery', 0.25);
    expect(store.get().intel.projects.imagery!.progress).toBeGreaterThan(0.25);
  });

  it('only finished intel can be sent', () => {
    const store = createStore(run(initialState(), 10_000));
    const before = store.get();
    store.sendIntel('imagery');
    expect(store.get()).toBe(before);
  });
});

describe('sending intel', () => {
  const finished = () => createStore(run(initialState(), 41_000));

  it('frees the slot, gives the team the buff, and the team acknowledges', () => {
    const store = finished();
    store.sendIntel('imagery');
    const s = store.get();
    expect(s.intel.projects.imagery).toBeNull();
    expect(s.intel.sent).toContain('route-overwatch');
    expect(hasBuff(s, 'imagery')).toBe(true);
    expect(s.comms.messages.at(-1)?.text).toMatch(/Got the route overwatch/);
  });

  it('the next imagery project takes the free slot when it comes in', () => {
    const store = finished();
    store.sendIntel('imagery');
    expect(run(store.get(), 50_000).intel.projects.imagery?.title).toBe('Town rooftops');
  });

  it('imagery makes the team move faster', () => {
    const walk = (s: GameState) => {
      const flat = { ...s, schedule: [], team: { ...s.team, position: squareCenter('G5')!, waypoint: 1, holdFor: null } };
      const a = run(flat, 3_000).team.position;
      return Math.hypot(a.x - flat.team.position.x, a.y - flat.team.position.y);
    };
    const store = finished();
    const plain = walk(store.get());
    store.sendIntel('imagery');
    expect(walk(store.get())).toBeGreaterThan(plain * 1.1);
  });

  it('buffs wear off', () => {
    const store = finished();
    store.sendIntel('imagery');
    expect(hasBuff(run(store.get(), 91_000), 'imagery')).toBe(false);
  });
});
