import { squareAt } from '../map/grid';
import type { Message } from './comms';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';
import { feed } from './intel';

// Confirmed kills earn cash (GDD), and a destroyed contact leaves a kill site. ALPHA sweeps
// it for documents worth cash as it passes through.

import { BANKRUPT_AT, CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH } from './prices';
export { CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH };
export const SITE_INTEL = 25; // intel a swept site feeds ALPHA's gauge (ILI-1315)

// Money in (the field, or out of escrow) and money out (support), kept on the mission's
// ledger for the P&L (ILI-1316). Spending can go as deep into the red as HQ likes, until the
// credit line runs out: then the PMC is bankrupt and the operation is over, mid-mission or not.
export const earn = (s: GameState, amount: number, from: 'field' | 'escrow' = 'field'): GameState => {
  const { budget, ledger } = s.resources;
  return { ...s, resources: { budget: budget + amount, ledger: { ...ledger, [from]: ledger[from] + amount } } };
};
export const spend = (s: GameState, amount: number): GameState => {
  const { budget, ledger } = s.resources;
  const next = { ...s, resources: { budget: budget - amount, ledger: { ...ledger, spent: ledger.spent - amount } } };
  return next.resources.budget <= BANKRUPT_AT && !s.bankrupt ? { ...next, bankrupt: true, phase: 'ended' } : next;
};

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
  const next = feed(earn(s, SEARCH_CASH), SITE_INTEL); // what it found feeds its own gauge (ILI-1315)
  const found: Message = {
    id: `search-${site.id}`,
    from: team.callsign,
    text: `Swept the kill site in ${site.square} on the way through: documents, maps, a phone. +$${SEARCH_CASH.toLocaleString('en-US')}, and intel to keep us moving.`,
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
