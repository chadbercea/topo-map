import { describe, expect, it } from 'vitest';
import { timeLeft } from './minigame';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
const REQUEST = 'event-request-c2';
// At the C2 imagery request (0:45), with the earlier contact answered so it's out of the way.
const atRequest = () => {
  const store = createStore(run(initialState(), 15_000));
  store.respond('event-contact-e3', 'wait');
  store.set(run(store.get(), 30_000));
  return store;
};

describe('grid scan mini game', () => {
  it('Send imagery spends a scan, starts the scan on C2 and keeps the team holding', () => {
    const store = atRequest();
    const scans = store.get().resources.scans;
    store.respond(REQUEST, 'send');
    const s = store.get();
    expect(s.resources.scans).toBe(scans - 1);
    expect(s.minigame).toMatchObject({ kind: 'gridScan', square: 'C2', status: 'active', hits: 0 });
    expect(s.minigame!.targets[0]).toBe('C2');
    expect(s.minigame!.targets).toHaveLength(4);
    expect(new Set(s.minigame!.targets).size).toBe(4);
    expect(s.team.holdFor).toBe(REQUEST);
  });

  it('tapping the targets in order wins: squares imaged, imagery intel boosted, team released', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    const before = store.get().intel.projects.imagery?.progress ?? 0;
    for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
    const s = store.get();
    expect(s.minigame?.status).toBe('won');
    expect(s.map.scanned).toEqual(expect.arrayContaining(s.minigame!.targets));
    expect(s.team.holdFor).toBeNull();
    expect(s.events.find((e) => e.id === 'request-c2')?.status).toBe('resolved');
    expect(s.comms.messages.at(-1)?.text).toMatch(/Imagery is good/);
    if (before < 1) expect(s.intel.projects.imagery!.progress).toBeGreaterThan(before);
  });

  it('a wrong tap costs a second; running out of time loses', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    const full = timeLeft(store.get());
    store.tapMiniGame('H5' === store.get().minigame!.targets[0] ? 'A1' : 'H5');
    expect(timeLeft(store.get())).toBe(full - 1000);
    store.set(run(store.get(), 9_100));
    expect(store.get().minigame?.status).toBe('lost');
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/No usable imagery/);
  });

  it('abort loses straight away; close clears the result', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    store.abortMiniGame();
    expect(store.get().minigame?.status).toBe('lost');
    store.closeMiniGame();
    expect(store.get().minigame).toBeNull();
  });

  it('the clock stops while paused, and taps are ignored', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    store.pause();
    const left = timeLeft(store.get());
    store.set(run(store.get(), 20_000));
    store.tapMiniGame(store.get().minigame!.targets[0]);
    expect(timeLeft(store.get())).toBe(left);
    expect(store.get().minigame!.hits).toBe(0);
  });
});

it('a won scan boosts imagery intel that is still in progress', () => {
  const store = createStore(run(initialState(), 5_000));
  const before = store.get().intel.projects.imagery!.progress;
  store.startMiniGame('gridScan', 'D3');
  for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
  expect(store.get().intel.projects.imagery!.progress).toBeGreaterThan(before + 0.2);
});

describe('grid scan, ported from the prototype', () => {
  it('images the square asked about, then unimaged squares ahead on the route', () => {
    const store = atRequest();
    const { route, waypoint } = store.get().team;
    store.respond(REQUEST, 'send');
    const { targets } = store.get().minigame!;
    expect(targets[0]).toBe('C2');
    const ahead = route.slice(waypoint).filter((sq) => sq !== 'C2');
    expect(targets.slice(1, 1 + Math.min(3, ahead.length))).toEqual(ahead.slice(0, 3));
  });

  it('ORION-3 calls the pass and the result', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    expect(store.get().comms.messages.at(-1)).toMatchObject({ from: 'ORION-3', text: expect.stringMatching(/^Pass over C2/) });
    for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
    const sat = store.get().comms.messages.filter((m) => m.from === 'ORION-3').at(-1);
    expect(sat?.text).toMatch(/imaged\. Downlinked to ALPHA\./);
  });

  it('records when each square was imaged', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    store.tapMiniGame(store.get().minigame!.targets[0]);
    expect(store.get().minigame!.hitAt).toEqual([store.get().elapsedMs]);
  });
});
