import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { cards, openCards, type Card } from './cards';
import { feed, pushPhoto, pushVideo } from './intel';
import type { MapEvent } from './events';
import { answer, asking, fed, run } from './testkit';

// COMMS as a card stack, the sim side (ILI-1346): every intel push and everything that wants
// HQ is a card, in the order it came in.

const blindAhead = (): GameState => {
  const s = initialState();
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};
const ofType = <T extends Card['type']>(s: GameState, type: T) => cards(s).filter((c): c is Extract<Card, { type: T }> => c.type === type);
const withEvent = (s: GameState, e: Partial<MapEvent> & Pick<MapEvent, 'id' | 'kind' | 'square'>): GameState => ({
  ...s,
  events: [...s.events, { title: 'Something on the map', atMs: s.elapsedMs, status: 'new', ...e }],
});

describe('intel cards', () => {
  it('a photo of the square ALPHA is heading into is an IMINT card, fed at once', () => {
    const s0 = blindAhead();
    const sq = s0.team.route[s0.team.waypoint];
    const [card] = ofType(pushPhoto(s0, sq, 0).next, 'intel');
    expect(card).toMatchObject({ source: 'IMINT', square: sq, fed: true });
    expect(card.grade).toMatch(/clear|low|medium|high/);
  });

  it('a photo further ahead is banked, and its card turns fed when ALPHA heads into the square', () => {
    const s0 = blindAhead();
    const later = s0.team.route[s0.team.waypoint + 1];
    const banked = pushPhoto(s0, later, 3).next;
    expect(ofType(banked, 'intel')[0]).toMatchObject({ square: later, grade: 'high', fed: false });
    const s = run({ ...banked, intel: { ...banked.intel, base: 100 } }, 60_000);
    expect(ofType(s, 'intel')[0]).toMatchObject({ square: later, fed: true });
  });

  it('video, a decode and what ALPHA finds itself are cards too; a bare feed (tuning) is not', () => {
    const s = pushVideo(feed(feed(feed(initialState(), 10), 35, { source: 'SIGINT', square: 'C2' }), 20, { source: 'ALPHA', square: 'E3' }));
    expect(ofType(s, 'intel').map((c) => c.source)).toEqual(['SIGINT', 'ALPHA', 'IMINT']);
    expect(ofType(s, 'intel').at(-1)?.grade).toBe('video');
  });

  it('a photo through the store lands as a card', () => {
    const store = createStore(initialState());
    store.lookAt('G5');
    store.capture('photo');
    expect(ofType(store.get(), 'intel')).toHaveLength(1);
  });
});

describe('event cards', () => {
  it('a map event that wants HQ is an open card until it is resolved; it never expires', () => {
    const s = withEvent(fed(initialState()), { id: 'contact-x', kind: 'contact', square: 'E3' });
    expect(openCards(s)).toMatchObject([{ kind: 'contact', square: 'E3', eventId: 'contact-x' }]);
    const later = run(s, 120_000);
    expect(ofType(later, 'event').find((c) => c.eventId === 'contact-x')?.open).toBe(true);
    const done = { ...s, events: s.events.map((e) => ({ ...e, status: 'resolved' as const })) };
    expect(openCards(done)).toHaveLength(0);
    expect(ofType(done, 'event')).toHaveLength(1); // still in the stack, answered
  });

  it('a building is answered once HQ sends ALPHA to search it', () => {
    const s = withEvent(initialState(), { id: 'building-D3', kind: 'building', square: 'D3' });
    expect(openCards(s)).toHaveLength(1);
    expect(openCards({ ...s, searching: ['D3'] })).toHaveLength(0);
  });

  it('a kill site is not a card: ALPHA sweeps it on its own', () => {
    expect(ofType(withEvent(initialState(), { id: 'site-1', kind: 'site', square: 'E3' }), 'event')).toHaveLength(0);
  });

  it('ALPHA asking HQ is an open ask card until the answer lands', () => {
    const s = asking();
    const ask = openCards(s).find((c) => c.kind === 'ask');
    expect(ask?.messageId).toBeTruthy();
    const store = createStore(s);
    const call = s.comms.messages.find((m) => m.id === ask!.messageId)!;
    answer(store, call.id, call.responses![0].id);
    expect(openCards(store.get()).find((c) => c.messageId === call.id)).toBeUndefined();
  });
});

describe('the stack', () => {
  it('radio lines are ALPHA and HQ only; ORION-3 and the analysts are on the instruments', () => {
    const store = createStore(fed(initialState()));
    store.lookAt('G5');
    store.tick(30_000);
    store.capture('photo');
    store.tick(10_000);
    const s = store.get();
    expect(s.comms.messages.some((m) => m.from === 'ORION-3')).toBe(true);
    expect(ofType(s, 'radio').every((c) => c.from === 'ALPHA' || c.from === 'HQ')).toBe(true);
  });

  it('cards keep the order they came in', () => {
    let s = fed(blindAhead()); // fed: no imagery request (ILI-1349) in the way
    s = pushPhoto(s, s.team.route[s.team.waypoint], 0).next;
    s = run(s, 5_000);
    s = withEvent(s, { id: 'signal-x', kind: 'signal', square: 'C2' });
    s = run(s, 5_000);
    s = feed(s, 35, { source: 'SIGINT', square: 'C2' });
    const all = cards(s);
    expect(all.map((c) => c.atMs)).toEqual([...all.map((c) => c.atMs)].sort((a, b) => a - b));
    expect(all.filter((c) => c.type !== 'radio').map((c) => c.type)).toEqual(['intel', 'event', 'intel']);
  });
});
