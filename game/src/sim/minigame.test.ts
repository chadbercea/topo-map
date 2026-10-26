import { describe, expect, it } from 'vitest';
import { timeLeft } from './minigame';
import { initialState } from './state';
import { createStore } from './store';
import { run } from './testkit';

// At the start ALPHA holds short of F4, which nobody has imaged.
const atRequest = () => createStore(run(initialState(), 500));
const REQUEST = 'unimaged-F4-1';

describe('grid scan mini game', () => {
  it('Send imagery spends a scan, starts the scan on F4 and keeps the team holding', () => {
    const store = atRequest();
    expect(store.get().team.holdFor).toBe(REQUEST);
    const scans = store.get().resources.scans;
    store.respond(REQUEST, 'send');
    const s = store.get();
    expect(s.resources.scans).toBe(scans - 1);
    expect(s.minigame).toMatchObject({ kind: 'gridScan', square: 'F4', status: 'active', hits: 0 });
    expect(s.minigame!.targets).toHaveLength(4);
    expect(new Set(s.minigame!.targets).size).toBe(4);
    expect(s.team.holdFor).toBe(REQUEST);
  });

  it('images the square asked about, then unimaged squares ahead on the route', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    expect(store.get().minigame!.targets).toEqual(['F4', 'E3', 'D3', 'C2']);
  });

  it('tapping the targets in order wins: squares imaged, contacts found, team released', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
    const s = store.get();
    expect(s.minigame?.status).toBe('won');
    expect(s.map.scanned).toEqual(expect.arrayContaining(['F4', 'E3', 'D3', 'C2']));
    expect(s.team.holdFor).toBeNull();
    // The scan found the checkpoint in E3 and the patrol in C2, both on the route.
    expect(s.contacts.filter((c) => c.status === 'revealed').map((c) => c.square).sort()).toEqual(['C2', 'E3']);
    expect(s.events.map((e) => e.square).sort()).toEqual(['C2', 'E3']);
    expect(s.comms.messages.some((m) => m.from === 'ORION-3' && /Contact in E3: a fortified checkpoint\. It is on ALPHA/.test(m.text))).toBe(true);
  });

  it('a wrong tap costs a second; running out of time loses and nothing is found', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    const full = timeLeft(store.get());
    store.tapMiniGame('A1');
    expect(timeLeft(store.get())).toBe(full - 1000);
    store.set(run(store.get(), 9_100));
    expect(store.get().minigame?.status).toBe('lost');
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().contacts.every((c) => c.status === 'hidden')).toBe(true);
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

  it('ORION-3 calls the pass and the downlink, and hit times are recorded', () => {
    const store = atRequest();
    store.respond(REQUEST, 'send');
    expect(store.get().comms.messages.at(-1)).toMatchObject({ from: 'ORION-3', text: expect.stringMatching(/^Pass over F4/) });
    store.tapMiniGame('F4');
    expect(store.get().minigame!.hitAt).toEqual([store.get().elapsedMs]);
    for (const sq of store.get().minigame!.targets.slice(1)) store.tapMiniGame(sq);
    expect(store.get().comms.messages.some((m) => m.from === 'ORION-3' && /imaged\. Downlinked to ALPHA\./.test(m.text))).toBe(true);
  });

  it('a won scan boosts imagery intel that is still in progress', () => {
    const store = createStore(run(initialState(), 5_000));
    const before = store.get().intel.projects.imagery!.progress;
    store.startMiniGame('gridScan', 'D3');
    for (const sq of store.get().minigame!.targets) store.tapMiniGame(sq);
    expect(store.get().intel.projects.imagery!.progress).toBeGreaterThan(before + 0.2);
  });
});
