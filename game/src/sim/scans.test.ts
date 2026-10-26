import { describe, expect, it } from 'vitest';
import { MAX_SCANS, RECHARGE_MS } from './scans';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
const quiet = (): GameState => ({ ...initialState(), schedule: [] }); // no demo events in the way

describe('scan pool', () => {
  it('starts full and does not recharge past capacity', () => {
    const s = run(quiet(), 60_000);
    expect(s.resources.scans).toBe(MAX_SCANS);
    expect(s.resources.rechargeAtMs).toBeNull();
  });

  it('recharges one scan at a time after use', () => {
    const store = createStore(run(quiet(), 1_000));
    store.manualScan('D3');
    store.abortMiniGame();
    store.closeMiniGame();
    store.manualScan('B2');
    store.abortMiniGame();
    store.closeMiniGame();
    expect(store.get().resources.scans).toBe(1);
    let s = run(store.get(), RECHARGE_MS + 200);
    expect(s.resources.scans).toBe(2);
    s = run(s, RECHARGE_MS);
    expect(s.resources.scans).toBe(3);
    expect(s.resources.rechargeAtMs).toBeNull();
  });

  it('HQ can scan on its own initiative: it spends from the same pool the team draws on', () => {
    const store = createStore(run(quiet(), 1_000));
    store.selectSquare('D3');
    store.manualScan('D3');
    const s = store.get();
    expect(s.resources.scans).toBe(MAX_SCANS - 1);
    expect(s.minigame).toMatchObject({ kind: 'gridScan', square: 'D3', status: 'active' });
    expect(s.map.selected).toBeNull();
    expect(s.team.holdFor).toBeNull(); // nobody waits on a scan HQ started
  });

  it('cannot scan with an empty pool or over a running pass', () => {
    const store = createStore(run(quiet(), 1_000));
    store.manualScan('D3');
    const during = store.get();
    store.manualScan('B2');
    expect(store.get()).toBe(during);
    const empty = createStore({ ...quiet(), resources: { budget: 0, scans: 0, rechargeAtMs: 99_999 } });
    const before = empty.get();
    empty.manualScan('D3');
    expect(empty.get()).toBe(before);
  });
});
