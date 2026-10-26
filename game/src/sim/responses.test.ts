import { describe, expect, it } from 'vitest';
import { blocked, TREE } from './responses';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
const atContact = () => createStore(run(initialState(), 15_000));
const CONTACT = 'event-contact-e3';
const msg = (s: GameState, id: string) => s.comms.messages.find((m) => m.id === id);

describe('response tree', () => {
  it('every call offers one to three responses', () => {
    for (const node of Object.values(TREE)) {
      expect(node.responses.length).toBeGreaterThanOrEqual(1);
      expect(node.responses.length).toBeLessThanOrEqual(3);
    }
  });

  it('push through: the team replies, moves, and the contact is closed', () => {
    const store = atContact();
    store.respond(CONTACT, 'push');
    const s = store.get();
    expect(msg(s, CONTACT)).toMatchObject({ status: 'read', answer: 'push' });
    expect(msg(s, `${CONTACT}-push`)?.text).toBe('Moving through.');
    expect(s.team.holdFor).toBeNull();
    expect(s.events.find((e) => e.id === 'contact-e3')?.status).toBe('resolved');
  });

  it('hold 20 s: the team waits, then moves on its own', () => {
    const store = atContact();
    store.respond(CONTACT, 'wait');
    const held = store.get().team.position;
    store.set(run(store.get(), 19_000));
    expect(store.get().team.position).toEqual(held);
    store.set(run(store.get(), 2_000));
    expect(store.get().team.position).not.toEqual(held);
  });

  it('get eyes on it spends a scan, images the square and leads to a follow-up call', () => {
    const store = atContact();
    const scans = store.get().resources.scans;
    store.respond(CONTACT, 'eyes');
    const s = store.get();
    expect(s.resources.scans).toBe(scans - 1);
    expect(s.map.scanned).toContain('E3');
    const follow = msg(s, `${CONTACT}-contact-imaged`);
    expect(follow?.text).toMatch(/two technicals in E3/);
    expect(s.team.holdFor).toBe(follow?.id); // still waiting, now on the follow-up
  });

  it('options are gated by capability, budget and scans', () => {
    const store = atContact();
    store.respond(CONTACT, 'eyes');
    const strike = TREE['contact-imaged'].responses.find((r) => r.id === 'strike')!;
    expect(blocked(store.get(), strike)).toBe('Not unlocked');
    store.respond(`${CONTACT}-contact-imaged`, 'strike'); // ignored
    expect(msg(store.get(), `${CONTACT}-contact-imaged`)?.status).toBe('new');

    const eyes = TREE.contact.responses.find((r) => r.id === 'eyes')!;
    const broke = { ...store.get(), resources: { ...store.get().resources, scans: 0 } };
    expect(blocked(broke, eyes)).toBe('No scans left');
    const rich = { ...store.get(), capabilities: ['imagery', 'strike'] as GameState['capabilities'], resources: { budget: 10_000, scans: 3 } };
    expect(blocked(rich, strike)).toBeNull();
  });

  it('an answered call cannot be answered again', () => {
    const store = atContact();
    store.respond(CONTACT, 'push');
    const after = store.get();
    store.respond(CONTACT, 'wait');
    expect(store.get()).toBe(after);
  });
});
