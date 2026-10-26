import { describe, expect, it } from 'vitest';
import { makeContact } from './contacts';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// ALPHA holding short of a found checkpoint in E3.
const facing = (): GameState => {
  const s = walking();
  return { ...s, contacts: [{ ...makeContact('cp', 'E3', 'a checkpoint', 1.6, [1, 5, 6, 9, 10]), status: 'revealed' }] };
};

describe('target painting', () => {
  it('observing paints the target, and ALPHA says so', () => {
    const store = createStore(run(facing(), 30_000));
    store.respond('contact-call-cp', 'observe');
    expect(store.get().contacts[0].painted).toBe(true);
    store.set(run(store.get(), 9_000));
    expect(store.get().comms.messages.find((m) => m.id === 'contact-call-cp-contact-observed')?.text).toMatch(/Target's painted for you/);
  });

  it('the war room strike on a painted target sees every fighter', () => {
    const store = createStore(run(facing(), 30_000));
    store.respond('contact-call-cp', 'observe');
    store.fire('cp', 'sniper');
    expect(store.get().minigame!.spotted).toEqual([1, 5, 6, 9, 10]);
  });

  it('unpainted, the board gives nothing away', () => {
    const store = createStore(facing());
    store.fire('cp', 'sniper');
    expect(store.get().minigame!.spotted).toEqual([]);
  });
});
