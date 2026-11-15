import { CROSS_MS, FLIGHT_MS } from './air';
import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH } from './sites';
import { CACHE_CASH } from './prices';
import type { GameState } from './state';
import { lockedStore as createStore } from './testkit';
import { run, walking } from './testkit';

const withContact = (status: 'revealed' | 'hidden' = 'revealed'): GameState => {
  const s = walking();
  return {
    ...s,
    contacts: [{ id: 't', square: 'E3', label: 'two technicals', strength: 1, status, observed: false, painted: true, units: [5, 6, 9, 10], total: 4 }],
    events: [{ id: 'contact-t', kind: 'contact', square: 'E3', title: 'Two technicals', atMs: 0, status: 'seen' }],
  };
};

describe('kill cash', () => {
  it('every confirmed kill from ordnance pays', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.set(run(store.get(), FLIGHT_MS + CROSS_MS + 200)); // REAPER-1 clears the square
    expect(store.get().resources.ledger.field).toBe(4 * CASH_PER_STRIKE_KILL);
  });

  it('the team clearing a contact itself pays per fighter', () => {
    const s0 = withContact();
    const s = run({ ...s0, team: { ...s0.team, position: squareCenter('E3')!, waypoint: 3, decisions: { E3: 'attack' } } }, 30_000);
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.resources.ledger.field).toBeGreaterThanOrEqual(4 * CASH_PER_TEAM_KILL);
  });
});

describe('kill sites', () => {
  it('a destroyed contact leaves a kill site on the map', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.set(run(store.get(), FLIGHT_MS + CROSS_MS + 200)); // REAPER-1 clears the square
    expect(store.get().events.find((e) => e.kind === 'site')).toMatchObject({ square: 'E3', status: 'new' });
  });

  it('ALPHA sweeps it on its own as it passes: no ask, no stop, and the find is in the feed (ILI-1252)', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.set(run(store.get(), FLIGHT_MS + CROSS_MS + 200));
    let s = store.get();
    const budget = s.resources.budget;
    for (let i = 0; i < 3000 && s.events.find((e) => e.kind === 'site')?.status !== 'resolved'; i++) s = run(s, 100);
    expect(s.events.find((e) => e.kind === 'site')?.status).toBe('resolved');
    expect([0, SEARCH_CASH, CACHE_CASH]).toContain(s.resources.budget - budget); // what it found is rolled (ILI-1564)
    expect(s.stats.searched).toBe(1);
    expect(s.comms.messages.find((m) => m.id === 'search-site-t')).toMatchObject({ from: 'ALPHA', holds: false, text: expect.stringMatching(/^HQ, ALPHA, kill site E3 searched/) });
    expect(s.comms.messages.some((m) => m.id.startsWith('site-call'))).toBe(false);
  });

  it('what a search turns up is rolled: across missions, more than one kind of find (ILI-1564)', () => {
    const finds = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const store = createStore({ ...withContact(), rng: seed * 7919 });
      store.fire('t', 'drone');
      store.set(run(store.get(), FLIGHT_MS + CROSS_MS + 200));
      let s = store.get();
      for (let i = 0; i < 3000 && s.events.find((e) => e.kind === 'site')?.status !== 'resolved'; i++) s = run(s, 100);
      const text = s.comms.messages.find((m) => m.id === 'search-site-t')?.text ?? '';
      finds.add(text.replace(/^.*searched: /, '').replace(/ at [A-H]\d/, ''));
    }
    expect(finds.size).toBeGreaterThan(1);
  });
});
