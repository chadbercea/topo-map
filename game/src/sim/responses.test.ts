import { describe, expect, it } from 'vitest';
import { odds, SOFTEN_MS, type Contact } from './contacts';
import { LINK_MS, waitingCalls } from './comms';
import { blocked, TREE } from './responses';
import type { GameState } from './state';
import { createStore } from './store';
import { asking, run, walking } from './testkit';

// ALPHA decides for itself (ILI-1315, ILI-1312): HQ finds a contact on its route, ALPHA weighs
// it and radios what it's doing. Take it, hold short for HQ to soften it, or go around.
const contact = (units: number[], strength = 1): Contact => ({ id: 'tech', square: 'E3', label: 'two technicals', strength, status: 'revealed', observed: false, units, total: units.length });
const facing = (c: Contact): GameState => ({ ...walking(), contacts: [c] });
const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 120_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const said = (s: GameState, re: RegExp) => s.comms.messages.some((m) => m.from === 'ALPHA' && re.test(m.text));

describe('ALPHA decides (ILI-1315)', () => {
  it('weighs a fight by their strength against its own: ammo and meds count', () => {
    const s = walking();
    const c = contact([1, 2, 3], 1);
    expect(odds(s, c)).toBeCloseTo(3 / 5);
    const spent = { ...s, team: { ...s.team, operators: s.team.operators.map((o) => ({ ...o, ammo: 0, meds: 0 })) } };
    expect(odds(spent, c)).toBe(Infinity); // no ammo: it can't take anything
  });

  it('light odds: it says it will take them, and goes in fighting without a hold', () => {
    const s = until(facing(contact([5, 6])), (x) => !!x.team.fight);
    expect(said(s, /Contact in E3, two technicals\. We'll take them\./)).toBe(true);
    expect(s.team.decisions.E3).toBe('attack');
    expect(s.team.holdFor).toBeNull();
    expect(s.team.fight).toMatchObject({ square: 'E3' });
  });

  it('close odds: it holds short for HQ to soften them, and goes in once HQ has', () => {
    let s = until(facing(contact([1, 5, 6, 9])), (x) => !!x.team.waitFor);
    expect(said(s, /Too many to walk into\. Soften them up and we'll go\./)).toBe(true);
    s = run(s, 2_000);
    expect(s.team.activity).toBe('Holding short of E3 · soften them up');
    const at = s.team.position;
    expect(run(s, 3_000).team.position).toEqual(at); // it waits
    // HQ's strike leaves one standing: now it'll take them.
    s = run({ ...s, contacts: s.contacts.map((c) => ({ ...c, units: [5] })) }, 200);
    expect(said(s, /That did it\. Moving in on E3\./)).toBe(true);
    expect(s.team.decisions.E3).toBe('attack');
    expect(s.team.waitFor).toBeNull();
  });

  it('close odds and HQ does nothing: after twenty seconds it goes around', () => {
    let s = until(facing(contact([1, 5, 6, 9])), (x) => !!x.team.waitFor);
    s = run(s, SOFTEN_MS + 500);
    expect(said(s, /No change in E3\. Going around via [A-H]\d\./)).toBe(true);
    expect(s.team.route).not.toContain('E3');
    expect(s.contacts[0].status).toBe('revealed'); // still there for HQ to hit
  });

  it('support wipes them out while it holds: it moves through', () => {
    let s = until(facing(contact([1, 5, 6, 9])), (x) => !!x.team.waitFor);
    s = run({ ...s, contacts: s.contacts.map((c) => ({ ...c, status: 'cleared' as const, units: [] })) }, 200);
    expect(said(s, /Targets in E3 are down\. Moving through\./)).toBe(true);
    expect(s.team.decisions.E3).toBe('push');
  });

  it('heavy odds: it goes around at once, through a neighbour, and the detour needs no question', () => {
    const s = until(facing(contact([1, 2, 5, 6, 9, 10], 1.6)), (x) => !x.team.route.includes('E3'));
    expect(said(s, /Not taking that\. Going around via [A-H]\d\./)).toBe(true);
    expect(s.contacts[0].status).toBe('revealed');
    expect(s.team.holdFor).toBeNull();
  });

  it('a swept kill site feeds ALPHA’s gauge as well as the budget', () => {
    const s0 = walking();
    const site = { id: 'site-x', kind: 'site' as const, square: 'G5', title: 'Kill site', atMs: 0, status: 'new' as const };
    const s = run({ ...s0, events: [...s0.events, site] }, 100);
    expect(s.intel.feeds.some((f) => f.amount === 25)).toBe(true);
    expect(s.comms.messages.some((m) => /intel to keep us moving/.test(m.text))).toBe(true);
  });
});

describe('what ALPHA still asks: resupply', () => {
  it('the tree is resupply alone, with one to three answers', () => {
    expect(Object.keys(TREE)).toEqual(['resupply']);
    for (const node of Object.values(TREE)) {
      expect(node.responses.length).toBeGreaterThanOrEqual(1);
      expect(node.responses.length).toBeLessThanOrEqual(3);
    }
    const send = TREE.resupply.responses[0];
    expect(blocked(walking(), send)).toBeNull(); // in the red is fine: HQ can spend into it (ILI-1316)
  });

  it('an answer goes up the link: ALPHA keeps holding, then reads it back and acts (ILI-1209)', () => {
    const store = createStore(asking());
    const call = store.get().team.holdFor!;
    store.respond(call, 'push');
    const sent = store.get();
    expect(waitingCalls(sent.comms)).toHaveLength(0); // the flag comes down at once
    expect(sent.team.holdFor).toBe(call); // but the team hasn't heard yet
    store.respond(call, 'resupply'); // one answer at a time
    expect(store.get()).toBe(sent);
    store.tick(LINK_MS);
    const landed = store.get();
    expect(landed.comms.messages.find((m) => m.id === call)?.answer).toBe('push');
    expect(landed.team.holdFor).not.toBe(call);
    expect(landed.comms.inFlight).toHaveLength(0);
  });
});
