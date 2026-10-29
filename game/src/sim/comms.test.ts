import { describe, expect, it } from 'vitest';
import { CHATTER_MS, currentCall, kindOf } from './comms';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

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

  it('unimaged ground ahead makes the team hold short and radio until HQ answers', () => {
    const s = run(initialState(), 500);
    const call = currentCall(s.comms)!;
    expect(call).toMatchObject({ node: 'unimaged', square: 'F4', holds: true });
    expect(call.text).toMatch(/Holding short of F4\. No imagery/);
    expect(s.team.holdFor).toBe(call.id);
    expect(run(s, 5_000).team.position).toEqual(s.team.position);
  });

  it('if HQ stays silent the team keeps holding: nothing is decided for HQ', () => {
    const s = run(initialState(), 60_000);
    expect(currentCall(s.comms)).toMatchObject({ node: 'unimaged', square: 'F4', status: 'new' });
    expect(s.team.decisions.F4).toBeUndefined();
    expect(s.team.position).toEqual(initialState().team.position);
  });

  it('dismissing a hold hides it but the team keeps waiting', () => {
    const store = createStore(run(initialState(), 500));
    const id = store.get().team.holdFor!;
    store.dismissCall(id);
    expect(store.get().comms.messages.find((m) => m.id === id)?.status).toBe('dismissed');
    expect(store.get().team.holdFor).toBe(id);
  });

  it('a new call reopens a minimized comms card; a log line does not', () => {
    const store = createStore(run(walking(), 500));
    store.setCommsMinimized(true);
    store.set(run(store.get(), 5_000)); // the insert line at 5 s is log only
    expect(store.get().comms.minimized).toBe(true);
    const fresh = createStore(run(initialState(), 100)); // holding short of F4: a call
    fresh.setCommsMinimized(true);
    fresh.set({ ...fresh.get(), comms: { ...fresh.get().comms, messages: [] }, team: { ...fresh.get().team, holdFor: null } });
    fresh.set(run(fresh.get(), 200));
    expect(fresh.get().comms.minimized).toBe(false);
  });

  it('calls in when the team reaches the end of its route', () => {
    let s = walking();
    for (let i = 0; i < 6000 && s.team.waypoint < s.team.route.length; i++) s = run(s, 100);
    s = run(s, 100);
    expect(ids(s)).toContain('in-position');
  });
});
