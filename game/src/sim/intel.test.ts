import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { feed, gauge, grade, GRADE_INTEL, MOVE_AT, pushPhoto, VIDEO_FLOOR } from './intel';
import { run } from './testkit';

// ALPHA's intel gauge (ILI-1314): it moves only while HQ keeps it fed.
const blindAhead = (): GameState => {
  const s = initialState();
  // HQ has said "move in blind" everywhere, so only the gauge decides whether ALPHA moves.
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};

describe('the intel gauge', () => {
  it('starts empty, and an unfed team holds where it is', () => {
    const s0 = blindAhead();
    expect(gauge(s0)).toBe(0);
    const s = run(s0, 3_000);
    expect(s.team.position).toEqual(s0.team.position);
    expect(s.team.activity).toBe('Holding · needs intel');
  });

  it('a feed hits the gauge and fades to nothing over ten seconds', () => {
    let s = feed(initialState(), 30);
    expect(gauge(s)).toBe(30);
    s = { ...s, elapsedMs: 5_000 };
    expect(gauge(s)).toBeCloseTo(15);
    s = { ...s, elapsedMs: 10_000 };
    expect(gauge(s)).toBe(0);
  });

  it('the team moves while the gauge is at the threshold or above, and holds once it fades below', () => {
    const s0 = feed(blindAhead(), 50); // high grade: above 20 for six seconds
    const moved = run(s0, 3_000);
    expect(moved.team.position).not.toEqual(s0.team.position);
    const later = run(moved, 5_000); // fed 8 s ago: 10, under the threshold
    expect(gauge(later)).toBeLessThan(MOVE_AT);
    const still = run(later, 2_000);
    expect(still.team.position).toEqual(later.team.position);
  });

  it('video sets a permanent floor, once; a second video is refused', () => {
    const store = createStore(blindAhead());
    store.lookAt('G5');
    store.capture('video');
    store.set(run(store.get(), 16_000));
    expect(store.get().intel.videoUsed).toBe(true);
    expect(gauge(store.get())).toBe(VIDEO_FLOOR);
    store.set(run(store.get(), 60_000));
    expect(gauge(store.get())).toBeGreaterThanOrEqual(VIDEO_FLOOR); // it never fades
    store.lookAt('F4');
    store.set(run(store.get(), 20_000));
    store.capture('video');
    expect(store.get().satellite.state).not.toBe('capturing');
  });

  it('a photo is graded by what it found: fighters are high grade, a square already gone through is all clear', () => {
    const s = initialState();
    expect(grade(s, 'E3', 5)).toBe('high');
    const { next, grade: first } = pushPhoto(s, 'F2', 0);
    expect(gauge(next)).toBe(GRADE_INTEL[first]);
    expect(grade(next, 'F2', 0)).toBe('clear');
    expect(grade(s, 'F2', 0)).toBe(first); // the same square grades the same in a replay
  });

  it('a photo through the store feeds ALPHA, and ORION-3 says what the analysts pushed', () => {
    const store = createStore(initialState());
    store.lookAt('G5');
    store.capture('photo');
    expect(gauge(store.get())).toBeGreaterThan(0);
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/Analysts: (all clear|[a-z]+-grade intel) pushed to ALPHA\./);
  });
});
