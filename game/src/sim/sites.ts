import { squareAt } from '../map/grid';
import { boostIntel } from './intel';
import { treeCall } from './responses';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';

// Confirmed kills earn cash (GDD), and a destroyed contact leaves a kill site. When ALPHA
// reaches one it offers to search it: intel and documents, at a cost against the clock.

export const CASH_PER_STRIKE_KILL = 1_500;
export const CASH_PER_TEAM_KILL = 1_000;
export const SEARCH_MS = 15_000;
export const SEARCH_CASH = 1_000;

export const earn = (s: GameState, amount: number): GameState => ({ ...s, resources: { ...s.resources, budget: s.resources.budget + amount } });

export function markSite(s: GameState, c: Contact): GameState {
  const id = `site-${c.id}`;
  if (s.events.some((e) => e.id === id)) return s;
  return { ...s, events: [...s.events, { id, kind: 'site', square: c.square, title: 'Kill site', atMs: s.elapsedMs, status: 'new' }] };
}

// ALPHA standing on an unsearched kill site, with nothing else going on, asks to search it.
export const siteSystem: System = (s) => {
  const { team } = s;
  if (team.holdFor || team.fight || team.treating || s.elapsedMs < team.holdUntilMs) return s;
  const here = squareAt(team.position.x, team.position.y);
  const site = s.events.find((e) => e.kind === 'site' && e.square === here && e.status !== 'resolved');
  if (!site) return s;
  const id = `site-call-${site.id}`;
  if (s.comms.messages.some((m) => m.id === id)) return s;
  const call = treeCall(s, id, 'site', site.square, site.id);
  return {
    ...s,
    team: { ...team, holdFor: id, activity: `At the kill site in ${site.square}` },
    comms: { ...s.comms, minimized: false, messages: [...s.comms.messages, call] },
  };
};

// Searching: the team digs through the site for a while; HQ gets intel and documents.
export function search(s: GameState, square: string): GameState {
  const site = s.events.find((e) => e.kind === 'site' && e.square === square && e.status !== 'resolved');
  if (!site) return s;
  let next = boostIntel(boostIntel(s, 'target', 0.4), 'signals', 0.2);
  next = earn(next, SEARCH_CASH);
  return {
    ...next,
    team: { ...next.team, holdUntilMs: s.elapsedMs + SEARCH_MS, activity: `Searching ${square}` },
    events: next.events.map((e) => (e === site ? { ...e, status: 'resolved' as const } : e)),
  };
}

export function pass(s: GameState, square: string): GameState {
  return { ...s, events: s.events.map((e) => (e.kind === 'site' && e.square === square ? { ...e, status: 'resolved' as const } : e)) };
}
