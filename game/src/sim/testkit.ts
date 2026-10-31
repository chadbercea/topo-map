// Shared fixtures for the sim's unit tests.
import { initialState, ROUTE, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { LINK_MS } from './comms';

// The sim's tests run with ALPHA's intel gauge pinned full, unless they're about the gauge
// (intel.test.ts): keeping the team fed is a game of its own (ILI-1314).
export const fed = (s: GameState): GameState => ({ ...s, intel: { ...s.intel, base: 100 } });

export const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};

// The team just walks: every square imaged and no contacts, so nothing stops it (not even
// the salvage convoy that cuts the exfil, ILI-1192; convoy.test.ts plays that).
export const walking = (): GameState => {
  const s = fed(initialState());
  return { ...s, contacts: [], map: { ...s.map, scanned: [...ROUTE] }, script: { ...s.script, fired: [...s.script.fired, 'convoy-on-exfil'] } };
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

// Run until ALPHA stops and asks HQ something (it holds short of a square, say), however long
// the walk there takes over the ground.
export function untilHold(s: GameState, maxMs = 120_000) {
  let next = s;
  for (let t = 0; t < maxMs && !next.team.holdFor; t += 100) next = run(next, 100);
  return next;
}

// Answer a call through the store and wait out the link, so the answer has landed (ILI-1209).
export function answer(store: ReturnType<typeof createStore>, id: string, responseId: string) {
  store.respond(id, responseId);
  store.tick(LINK_MS);
}
