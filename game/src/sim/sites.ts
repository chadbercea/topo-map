import { squareAt } from '../map/grid';
import type { Message } from './comms';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';

// Confirmed kills earn cash (GDD), and a destroyed contact leaves a kill site. ALPHA sweeps
// it for documents worth cash as it passes through.

export const CASH_PER_STRIKE_KILL = 1_500;
export const CASH_PER_TEAM_KILL = 1_000;
export const SEARCH_CASH = 1_000;

export const earn = (s: GameState, amount: number): GameState => ({ ...s, resources: { ...s.resources, budget: s.resources.budget + amount } });

export function markSite(s: GameState, c: Contact): GameState {
  const id = `site-${c.id}`;
  if (s.events.some((e) => e.id === id)) return s;
  return { ...s, events: [...s.events, { id, kind: 'site', square: c.square, title: 'Kill site', atMs: s.elapsedMs, status: 'new' }] };
}

// ALPHA sweeps a kill site on its own as it passes through (ILI-1252): no ask and no stop, it's
// the team's business, not a support call. What it finds is intel for the feed.
export const siteSystem: System = (s) => {
  const { team } = s;
  if (team.fight) return s;
  const here = squareAt(team.position.x, team.position.y);
  const site = s.events.find((e) => e.kind === 'site' && e.square === here && e.status !== 'resolved');
  if (!site) return s;
  const next = earn(s, SEARCH_CASH);
  const found: Message = {
    id: `search-${site.id}`,
    from: team.callsign,
    text: `Swept the kill site in ${site.square} on the way through: documents, maps, a phone. +$${SEARCH_CASH.toLocaleString('en-US')}.`,
    atMs: s.elapsedMs,
    status: 'new',
    holds: false,
  };
  return {
    ...next,
    stats: { ...next.stats, searched: next.stats.searched + 1 },
    events: next.events.map((e) => (e === site ? { ...e, status: 'resolved' as const } : e)),
    comms: { ...next.comms, messages: [...next.comms.messages, found] },
  };
};

export function pass(s: GameState, square: string): GameState {
  return { ...s, events: s.events.map((e) => (e.kind === 'site' && e.square === square ? { ...e, status: 'resolved' as const } : e)) };
}
