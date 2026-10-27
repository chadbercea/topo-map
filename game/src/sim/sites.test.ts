import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH, SEARCH_MS } from './sites';
import type { GameState } from './state';
import { createStore } from './store';
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
    store.tapMiniGame('E3', 5);
    expect(store.get().resources.budget).toBe(4 * CASH_PER_STRIKE_KILL);
  });

  it('the team clearing a contact itself pays per fighter', () => {
    const s0 = withContact();
    const s = run({ ...s0, team: { ...s0.team, position: squareCenter('E3')!, waypoint: 3, decisions: { E3: 'attack' } } }, 30_000);
    expect(s.contacts[0].status).toBe('cleared');
    expect(s.resources.budget).toBeGreaterThanOrEqual(4 * CASH_PER_TEAM_KILL);
  });
});

describe('kill sites', () => {
  it('a destroyed contact leaves a kill site on the map', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.tapMiniGame('E3', 5);
    expect(store.get().events.find((e) => e.kind === 'site')).toMatchObject({ square: 'E3', status: 'new' });
  });

  it('reaching it, ALPHA offers to search; searching costs time and the documents pay', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.tapMiniGame('E3', 5);
    let s = store.get();
    for (let i = 0; i < 3000 && !s.team.holdFor?.startsWith('site-call'); i++) s = run(s, 100);
    expect(s.comms.messages.find((m) => m.id === s.team.holdFor)?.text).toMatch(/^At the kill site in E3/);
    const budget = s.resources.budget;
    const st = createStore(s);
    st.respond(s.team.holdFor!, 'search');
    s = st.get();
    expect(s.resources.budget).toBe(budget + SEARCH_CASH);
    expect(s.events.find((e) => e.kind === 'site')?.status).toBe('resolved');
    const at = s.team.position;
    expect(run(s, SEARCH_MS - 500).team.position).toEqual(at);
    expect(run(s, SEARCH_MS + 2_000).team.position).not.toEqual(at);
  });

  it('keep moving skips the search', () => {
    const store = createStore(withContact());
    store.fire('t', 'drone');
    store.tapMiniGame('E3', 5);
    let s = store.get();
    for (let i = 0; i < 3000 && !s.team.holdFor?.startsWith('site-call'); i++) s = run(s, 100);
    const st = createStore(s);
    st.respond(s.team.holdFor!, 'pass');
    expect(st.get().events.find((e) => e.kind === 'site')?.status).toBe('resolved');
    expect(st.get().team.holdFor).toBeNull();
  });
});
