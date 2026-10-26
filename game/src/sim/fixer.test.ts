import { describe, expect, it } from 'vitest';
import { makeContact } from './contacts';
import { blocked, FIXER_DISTRACTION, FIXER_GUIDE, TREE } from './responses';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

const rich = (s: GameState, budget = 10_000): GameState => ({ ...s, resources: { ...s.resources, budget } });

describe('local fixer', () => {
  it('costs money: greyed out until the field budget covers it', () => {
    const guide = TREE.unimaged.responses.find((r) => r.id === 'fixer')!;
    expect(blocked(initialState(), guide)).toBe('Over budget');
    expect(blocked(rich(initialState()), guide)).toBeNull();
  });

  it('guide: instead of a scan, a local walks ALPHA in and says what is there', () => {
    const store = createStore(run(rich(initialState()), 500)); // holding short of F4
    const id = store.get().team.holdFor!;
    const scans = store.get().resources.scans;
    store.respond(id, 'fixer');
    const s = store.get();
    expect(s.resources.budget).toBe(10_000 - FIXER_GUIDE);
    expect(s.resources.scans).toBe(scans); // no scan spent
    expect(s.map.scanned).toContain('F4');
    expect(run(s, 2_000).team.position).not.toEqual(s.team.position); // F4 is clear: they move
  });

  it('guide into a contact: the fixer reports it, and ALPHA asks again', () => {
    const s0 = rich(initialState());
    const store = createStore(run({ ...s0, contacts: [makeContact('x', 'F4', 'a sentry', 0.5, [3])] }, 500));
    store.respond(store.get().team.holdFor!, 'fixer');
    const s = run(store.get(), 500);
    expect(s.contacts[0].status).toBe('revealed');
    expect(s.comms.messages.some((m) => m.from === 'FIXER' && /Contact in F4: a sentry/.test(m.text))).toBe(true);
    expect(s.team.holdFor).toBe('contact-call-x');
  });

  it('distraction: after observing, half of them chase the fixer and ALPHA goes in', () => {
    const s0 = rich(walking());
    const store = createStore({ ...s0, contacts: [{ ...makeContact('t', 'E3', 'a checkpoint', 1.6, [1, 5, 6, 9, 10]), status: 'revealed' }] });
    store.set(run(store.get(), 30_000));
    store.respond('contact-call-t', 'observe');
    store.set(run(store.get(), 9_000));
    const call = 'contact-call-t-contact-observed';
    expect(store.get().comms.messages.find((m) => m.id === call)?.responses?.map((r) => r.id)).toContain('distract');
    store.respond(call, 'distract');
    const s = store.get();
    expect(s.resources.budget).toBe(10_000 - FIXER_DISTRACTION);
    expect(s.contacts[0].strength).toBeCloseTo(0.8);
    expect(s.team.decisions.E3).toBe('attack');
  });
});
