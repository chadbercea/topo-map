import { squareAt } from '../map/grid';
import type { Message } from './comms';
import type { Contact } from './contacts';
import type { GameState } from './state';
import type { System } from './systems';
import { feed, postDecoded } from './intel';
import { reveal } from './contacts';
import { nextRandom } from './firefight';
import { CACHE_CASH } from './prices';

// Confirmed kills earn cash (GDD), and a destroyed contact leaves a kill site. ALPHA sweeps
// it for documents worth cash as it passes through.

import { bankruptAt } from './upgrades';
import { CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH } from './prices';
export { CASH_PER_STRIKE_KILL, CASH_PER_TEAM_KILL, SEARCH_CASH };
export const SITE_INTEL = 25; // what a swept site's intel is worth, on the record (ILI-1315)

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
  return next.resources.budget <= bankruptAt(s) && !s.bankrupt ? { ...next, bankrupt: true, phase: 'ended' } : next;
};

// A strike's battle damage on the square, for the flyout's BDA line (counts go there, not on the radio).
export const addBda = (s: GameState, square: string, n: number): GameState =>
  n ? { ...s, bda: { ...s.bda, [square]: (s.bda?.[square] ?? 0) + n } } : s;

export function markSite(s: GameState, c: Contact): GameState {
  const id = `site-${c.id}`;
  if (s.events.some((e) => e.id === id)) return s;
  return { ...s, events: [...s.events, { id, kind: 'site', square: c.square, title: 'Kill site', atMs: s.elapsedMs, status: 'new' }] };
}

// ALPHA sweeps a kill site on its own as it passes through (ILI-1252): no ask and no stop, it's
// the team's business, not a support call. What it finds is intel for the feed.
export const siteSystem: System = (s) => {
  const { team } = s;
  if (team.fight || s.exfil) return s; // the bird's called: no sweep, it boards (ILI-1561)
  const here = squareAt(team.position.x, team.position.y);
  const site = s.events.find((e) => e.kind === 'site' && e.square === here && e.status !== 'resolved');
  if (!site) return s;
  const [find, after] = searchFind(s, site.square);
  const next = feed(after, SITE_INTEL, { source: 'ALPHA', square: site.square, items: [{ kind: 'HUMINT', heat: 'some', text: `${s.team.callsign} swept the site` }] }); // what it found feeds its own gauge (ILI-1315)
  const found: Message = {
    id: `search-${site.id}`,
    from: team.callsign,
    text: `HQ, ${s.team.callsign}, kill site ${site.square} searched: ${find}.`, // the budget chip shows the cash
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

// What a search turns up (ILI-1564), on the mission's dice so a mission replays the same: a map
// marking a group nobody has found (revealed, and ALPHA knows where), a cache worth selling, the
// usual documents, or nothing of value.
function searchFind(s: GameState, square: string): [string, GameState] {
  const [r, rng] = nextRandom(s.rng);
  const next = { ...s, rng };
  const hidden = next.contacts.filter((c) => c.status === 'hidden');
  if (r < 0.3 && hidden.length) {
    // The hidden group nearest the site.
    const dist = (sq: string) => Math.abs(sq.charCodeAt(0) - square.charCodeAt(0)) + Math.abs(Number(sq.slice(1)) - Number(square.slice(1)));
    const c = [...hidden].sort((a, b) => dist(a.square) - dist(b.square))[0];
    return [`a map marking enemy at ${c.square}`, postDecoded(reveal(next, [c.square]), c.square, c.id, 0, false)];
  }
  if (r < 0.55) return ['a weapons cache, sold on', earn(next, CACHE_CASH)];
  if (r < 0.85) return ['documents, maps, a phone', earn(next, SEARCH_CASH)];
  return ['nothing of value', next];
}

export function pass(s: GameState, square: string): GameState {
  return { ...s, events: s.events.map((e) => (e.kind === 'site' && e.square === square ? { ...e, status: 'resolved' as const } : e)) };
}
