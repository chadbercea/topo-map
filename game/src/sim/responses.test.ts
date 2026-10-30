import { describe, expect, it } from 'vitest';
import { OBSERVE_MS } from './contacts';
import { LINK_MS, waitingCalls } from './comms';
import { blocked, TREE } from './responses';
import type { GameState } from './state';
import { createStore } from './store';
import { answer, run, walking, untilHold } from './testkit';

// ALPHA at F4 with the technicals in E3 found: it holds short and asks what to do.
const atContact = () => {
  const s = walking();
  const store = createStore({
    ...s,
    contacts: [{ id: 'technicals', square: 'E3', label: 'two technicals', strength: 1, status: 'revealed', observed: false, units: [5, 6, 9, 10], total: 4 }],
  });
  store.set(untilHold(store.get()));
  return store;
};
const CALL = 'contact-call-technicals';
const msg = (s: GameState, id: string) => s.comms.messages.find((m) => m.id === id);

describe('response tree', () => {
  it('every call offers one to three responses', () => {
    for (const node of Object.values(TREE)) {
      expect(node.responses.length).toBeGreaterThanOrEqual(1);
      expect(node.responses.length).toBeLessThanOrEqual(3);
    }
  });

  it('a found contact on the route makes the team hold short and ask', () => {
    const s = atContact().get();
    expect(s.team.holdFor).toBe(CALL);
    expect(msg(s, CALL)?.text).toBe('Contact in E3, two technicals, on our route. Hold and watch, attack, or go around?');
    expect(s.team.activity).toBe('Holding short of E3');
  });

  it('attack: the team moves in and fights with surprise', () => {
    const store = atContact();
    answer(store, CALL, 'attack');
    expect(msg(store.get(), CALL)).toMatchObject({ status: 'read', answer: 'attack' });
    expect(store.get().team.holdFor).toBeNull();
    let s = store.get();
    for (let i = 0; i < 600 && !s.team.fight; i++) s = run(s, 100);
    expect(s.team.fight).toMatchObject({ square: 'E3', full: 50 });
  });

  it('attack: ORION-3 swings onto the fight on its own, without a radio line (ILI-1275)', () => {
    const store = atContact();
    answer(store, CALL, 'attack');
    let s = store.get();
    for (let i = 0; i < 600 && !s.team.fight; i++) s = run(s, 100);
    expect(s.satellite.aim).toBe('E3');
    expect(s.satellite.state).not.toBe('idle');
    expect(s.comms.messages.some((m) => m.from === 'ORION-3' && /^Moving to E3/.test(m.text))).toBe(false);
  });

  it('observe: the team watches, gets a look next door, then asks again', () => {
    const store = atContact();
    answer(store, CALL, 'observe');
    let s = store.get();
    expect(s.contacts[0].observed).toBe(true);
    const held = s.team.position;
    s = run(s, OBSERVE_MS - 500);
    expect(s.team.position).toEqual(held);
    expect(msg(s, `${CALL}-contact-observed`)).toBeUndefined(); // still watching
    s = run(s, 1_000);
    expect(msg(s, `${CALL}-contact-observed`)?.text).toMatch(/^Eyes on E3: two technicals, dug in/);
    expect(s.team.holdFor).toBe(`${CALL}-contact-observed`);
  });

  it('go around: the route detours through a neighbour and the contact is avoided', () => {
    const store = atContact();
    answer(store, CALL, 'avoid');
    const s = store.get();
    expect(s.team.route).not.toContain('E3');
    expect(s.team.route[2]).toBe('E4'); // touches F4 before and D3 after
    expect(s.contacts[0].status).toBe('avoided');
  });

  it('the detour square needs imagery of its own', () => {
    const store = atContact();
    const s0 = store.get();
    store.set({ ...s0, map: { ...s0.map, scanned: s0.map.scanned.filter((sq) => sq !== 'E4') } });
    answer(store, CALL, 'avoid');
    const s = run(store.get(), 500);
    expect(s.team.holdFor).toMatch(/^unimaged-E4/);
  });

  it('send imagery is greyed out while ORION-3 is busy; an answered call cannot be answered again', () => {
    const send = TREE.unimaged.responses.find((r) => r.id === 'send')!;
    const s = walking();
    expect(blocked(s, send)).toBeNull();
    expect(blocked({ ...s, satellite: { ...s.satellite, state: 'capturing' } }, send)).toBe('ORION-3 busy');
    expect(blocked({ ...s, capabilities: [] }, send)).toBe('Unavailable');

    const store = atContact();
    answer(store, CALL, 'attack');
    const after = store.get();
    store.respond(CALL, 'avoid');
    expect(store.get()).toBe(after);
  });

  it('an answer goes up the link: ALPHA keeps holding, then reads it back and acts (ILI-1209)', () => {
    const store = atContact();
    store.respond(CALL, 'attack');
    const sent = store.get();
    expect(waitingCalls(sent.comms)).toHaveLength(0); // the flag comes down at once
    expect(sent.team.holdFor).toBe(CALL); // but the team hasn't heard yet
    expect(sent.comms.messages.some((m) => m.text === 'Moving in hard.')).toBe(false);
    store.respond(CALL, 'avoid'); // one answer at a time
    expect(store.get()).toBe(sent);
    store.tick(LINK_MS - 100);
    expect(store.get().team.holdFor).toBe(CALL);
    store.tick(100);
    const landed = store.get();
    expect(landed.comms.messages.at(-1)?.text).toBe('Moving in hard.');
    expect(landed.comms.messages.find((m) => m.id === CALL)?.answer).toBe('attack');
    expect(landed.team.holdFor).not.toBe(CALL);
    expect(landed.comms.inFlight).toHaveLength(0);
  });
});
