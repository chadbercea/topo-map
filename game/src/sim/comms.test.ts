import { describe, expect, it } from 'vitest';
import { CHATTER_MS, currentCall, HOLD_TIMEOUT_MS } from './comms';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

const ids = (s: GameState) => s.comms.messages.map((m) => m.id);

describe('comms', () => {
  it('the team calls in on the timed script, marked new, from its callsign', () => {
    const s = run(walking(), 3_000);
    expect(s.comms.messages.find((m) => m.id === 'insert')).toMatchObject({ from: 'ALPHA', status: 'new', holds: false });
    expect(currentCall(s.comms)?.id).toBe('insert');
  });

  it('routine chatter marks itself read after a while', () => {
    const s = run(walking(), 3_000 + CHATTER_MS);
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

  it('if HQ stays silent the team pushes on blind', () => {
    const s = run(initialState(), HOLD_TIMEOUT_MS + 1_000);
    expect(ids(s).some((id) => id.endsWith('-timeout'))).toBe(true);
    expect(s.team.decisions.F4).toBe('blind');
    expect(run(s, 2_000).team.position).not.toEqual(s.team.position);
  });

  it('dismissing a hold hides it but the team keeps waiting', () => {
    const store = createStore(run(initialState(), 500));
    const id = store.get().team.holdFor!;
    store.dismissCall(id);
    expect(store.get().comms.messages.find((m) => m.id === id)?.status).toBe('dismissed');
    expect(store.get().team.holdFor).toBe(id);
  });

  it('a new call reopens a minimized comms window', () => {
    const store = createStore(run(walking(), 500));
    store.setCommsMinimized(true);
    store.set(run(store.get(), 3_000)); // insert call at 3 s
    expect(store.get().comms.minimized).toBe(false);
  });

  it('calls in when the team reaches the end of its route', () => {
    let s = walking();
    for (let i = 0; i < 6000 && s.team.waypoint < s.team.route.length; i++) s = run(s, 100);
    s = run(s, 100);
    expect(ids(s)).toContain('in-position');
  });
});
