import { describe, expect, it } from 'vitest';
import { CHATTER_MS, currentCall, kindOf } from './comms';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { asking, fed, run, walking } from './testkit';

const ids = (s: GameState) => s.comms.messages.map((m) => m.id);

describe('comms', () => {
  it('routine chatter from the script goes to the radio log, not the comms card', () => {
    const s = run(walking(), 5_000);
    const insert = s.comms.messages.find((m) => m.id === 'insert')!;
    expect(insert).toMatchObject({ from: 'ALPHA', holds: false });
    expect(kindOf(insert)).toBe('log');
    expect(currentCall(s.comms)).toBeUndefined();
  });

  it('routine chatter marks itself read after a while', () => {
    const s = run(walking(), 5_000 + CHATTER_MS);
    expect(s.comms.messages.find((m) => m.id === 'insert')?.status).toBe('read');
  });

  it('ALPHA doesn\u2019t ask about unimaged ground: fed, it walks on into F4 (ILI-1315)', () => {
    const s0 = fed(initialState());
    const s = run(s0, 20_000);
    expect(currentCall(s.comms)).toBeUndefined();
    expect(s.team.holdFor).toBeNull();
    expect(s.team.position).not.toEqual(s0.team.position);
  });

  it('unfed, ALPHA holds without asking anything (ILI-1314, ILI-1315)', () => {
    const s = run(initialState(), 20_000);
    expect(currentCall(s.comms)).toBeUndefined();
    expect(s.team.activity).toBe('Holding · needs intel');
    expect(s.team.position).toEqual(initialState().team.position);
  });

  it('dismissing a hold hides it but the team keeps waiting', () => {
    const store = createStore(asking());
    const id = store.get().team.holdFor!;
    expect(id).toBeTruthy();
    store.dismissCall(id);
    expect(store.get().comms.messages.find((m) => m.id === id)?.status).toBe('dismissed');
    expect(store.get().team.holdFor).toBe(id);
  });

  it('a new call reopens a minimized comms card; a log line does not', () => {
    const store = createStore(run(walking(), 500));
    store.setCommsMinimized(true);
    store.set(run(store.get(), 5_000)); // the insert line at 5 s is log only
    expect(store.get().comms.minimized).toBe(true);
    const s = store.get();
    store.set(asking(s)); // combat ineffective: a call
    expect(store.get().comms.minimized).toBe(false);
  });

  it('calls in when the team reaches the end of its route', () => {
    let s = walking();
    for (let i = 0; i < 6000 && s.team.waypoint < s.team.route.length; i++) s = run(s, 100);
    s = run(s, 100);
    expect(ids(s)).toContain('in-position');
  });
});
