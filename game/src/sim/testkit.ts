// Shared fixtures for the sim's unit tests.
import { initialState, ROUTE, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';

export const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};

// The team just walks: every square imaged and no contacts, so nothing stops it.
export const walking = (): GameState => {
  const s = initialState();
  return { ...s, contacts: [], map: { ...s.map, scanned: [...ROUTE] } };
};

// Answer every call the moment it comes in with the given response (or the first one that
// isn't blocked), until the predicate holds or time runs out.
export function playUntil(start: GameState, done: (s: GameState) => boolean, pick = (ids: string[]) => ids[0], maxMs = 600_000) {
  const store = createStore(start);
  for (let t = 0; t < maxMs && !done(store.get()); t += 100) {
    store.tick(100);
    const hold = store.get().team.holdFor;
    const call = store.get().comms.messages.find((m) => m.id === hold && m.status === 'new');
    if (call?.responses) store.respond(call.id, pick(call.responses.map((r) => r.id)));
  }
  return store;
}
