import { describe, expect, it } from 'vitest';
import { CHATTER_MS, currentCall, HOLD_TIMEOUT_MS } from './comms';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
const ids = (s: GameState) => s.comms.messages.map((m) => m.id);

describe('comms', () => {
  it('the team calls in on the timed script, marked new, from its callsign', () => {
    const s = run(initialState(), 3_000);
    expect(s.comms.messages).toHaveLength(1);
    expect(s.comms.messages[0]).toMatchObject({ id: 'insert', from: 'ALPHA', status: 'new', holds: false });
    expect(currentCall(s.comms)?.id).toBe('insert');
  });

  it('routine chatter marks itself read after a while', () => {
    const s = run(initialState(), 3_000 + CHATTER_MS);
    expect(s.comms.messages[0].status).toBe('read');
    expect(currentCall(s.comms)).toBeUndefined();
  });

  it('a contact makes the team radio in and hold until HQ answers', () => {
    let s = run(initialState(), 15_000);
    expect(ids(s)).toContain('event-contact-e3');
    expect(s.team.holdFor).toBe('event-contact-e3');
    expect(s.team.activity).toBe('Holding for HQ');
    const held = s.team.position;
    s = run(s, 5_000);
    expect(s.team.position).toEqual(held);

    const store = createStore(s);
    store.confirmCall('event-contact-e3');
    expect(store.get().team.holdFor).toBeNull();
    expect(ids(store.get())).toContain('event-contact-e3-ack');
    store.tick(100);
    store.tick(100);
    expect(store.get().team.position).not.toEqual(held);
  });

  it('if HQ stays silent the team gives up waiting and pushes on', () => {
    let s = run(initialState(), 15_000);
    s = run(s, HOLD_TIMEOUT_MS);
    expect(s.team.holdFor).toBeNull();
    expect(ids(s)).toContain('event-contact-e3-timeout');
  });

  it('dismissing a hold hides it but the team keeps waiting', () => {
    const store = createStore(run(initialState(), 15_000));
    store.dismissCall('event-contact-e3');
    expect(store.get().comms.messages.find((m) => m.id === 'event-contact-e3')?.status).toBe('dismissed');
    expect(store.get().team.holdFor).toBe('event-contact-e3');
  });

  it('a new call reopens a minimized comms window', () => {
    const store = createStore(run(initialState(), 3_000));
    store.setCommsMinimized(true);
    store.set(run(store.get(), 12_000)); // contact call at 15 s
    expect(store.get().comms.minimized).toBe(false);
  });

  it('calls in when the team reaches the end of its route', () => {
    const store = createStore();
    // Answer every hold straight away so the team keeps walking.
    for (let i = 0; i < 6000 && store.get().team.waypoint < store.get().team.route.length; i++) {
      store.tick(100);
      const hold = store.get().team.holdFor;
      if (hold) store.confirmCall(hold);
    }
    store.tick(100);
    const s = store.get();
    expect(ids(s)).toContain('in-position');
  });
});
