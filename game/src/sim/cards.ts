import type { GameState } from './state';
import { kindOf, sending } from './comms';
import type { Grade, PushSource } from './intel';
import type { EventKind } from './events';

// COMMS as a card stack (option D, ILI-1342; the sim side is ILI-1346). Everything that reaches
// HQ, in the order it came in:
// - intel cards: routine, every push of intel to ALPHA; they feed the gauge on their own, or
//   wait banked for the square ALPHA heads into next;
// - event cards: something that wants HQ (a contact, radio traffic, a building, a request,
//   ALPHA asking). Open until it's answered; they never expire;
// - radio lines: ALPHA's and HQ's own words, plain, between the cards.
// A pure view of the state: nothing here is stored, so it can't drift from what happened.

export type EventCardKind = Exclude<EventKind, 'site'> | 'ask';

export type Card =
  | { type: 'intel'; id: string; atMs: number; source: PushSource; square?: string; grade?: Grade | 'video'; fed: boolean }
  | { type: 'event'; id: string; atMs: number; kind: EventCardKind; square?: string; title: string; open: boolean; eventId?: string; messageId?: string }
  | { type: 'radio'; id: string; atMs: number; from: string; text: string };

// A kill site isn't HQ's to answer: ALPHA sweeps it on the way through, and what it finds shows
// up as an intel card.
const asksHq = (kind: EventKind): kind is Exclude<EventKind, 'site'> => kind !== 'site';

export function cards(s: GameState): Card[] {
  const call = s.team.callsign;
  const intel: Card[] = s.intel.pushes.map((p) => ({ type: 'intel', id: `card-${p.id}`, atMs: p.atMs, source: p.source, square: p.square, grade: p.grade, fed: p.state === 'fed' }));

  const events: Card[] = s.events.flatMap((e) => {
    if (!asksHq(e.kind)) return [];
    // A building is answered once HQ sends ALPHA in, before the search is done.
    const answered = e.status === 'resolved' || (e.kind === 'building' && s.searching.includes(e.square));
    return [{ type: 'event' as const, id: `card-${e.id}`, atMs: e.atMs, kind: e.kind, square: e.square, title: e.title, open: !answered, eventId: e.id }];
  });

  // ALPHA's calls that want an answer. One that belongs to a map event is that event's card.
  const eventIds = new Set(s.events.map((e) => e.id));
  const asks: Card[] = s.comms.messages
    .filter((m) => kindOf(m) === 'call' && !(m.eventId && eventIds.has(m.eventId)))
    .map((m) => ({ type: 'event', id: `card-${m.id}`, atMs: m.atMs, kind: 'ask', square: m.square, title: m.label ?? m.text, open: m.status === 'new' && !sending(s.comms, m.id), messageId: m.id }));

  const radio: Card[] = s.comms.messages
    .filter((m) => (m.from === call || m.from === 'HQ') && kindOf(m) !== 'call')
    .map((m) => ({ type: 'radio', id: `card-${m.id}`, atMs: m.atMs, from: m.from, text: m.text }));

  // Oldest first; things that landed on the same tick keep this order: what was said, what it
  // asks, then the intel.
  const order = { radio: 0, event: 1, intel: 2 } as const;
  return [...radio, ...events, ...asks, ...intel].sort((a, b) => a.atMs - b.atMs || order[a.type] - order[b.type]);
}

// Event cards still waiting on HQ, oldest first.
export const openCards = (s: GameState) => cards(s).filter((c): c is Extract<Card, { type: 'event' }> => c.type === 'event' && c.open);
