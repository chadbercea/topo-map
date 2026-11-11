// Shared fixtures for the sim's unit tests.
import { initialState, ROUTE, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { initialOrdnance, WEAPONS } from './ordnance';
import { LINK_MS } from './comms';
import { initialSatellite } from './satellite';

// The sim's tests run with ALPHA's intel gauge pinned full, unless they're about the gauge
// (intel.test.ts): keeping the team fed is a game of its own (ILI-1314).
export const fed = (s: GameState): GameState => ({ ...s, intel: { ...s.intel, base: 100 }, ordnance: initialOrdnance(WEAPONS) }); // and every capability open (ILI-1316)

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

// ALPHA's one question since it decides for itself (ILI-1315): combat ineffective, it stops and
// asks for a resupply bird. Two operators down, a moment later, the call is up.
export function asking(s: GameState = walking()): GameState {
  const ops = s.team.operators.map((o, i) => (i < 2 ? { ...o, health: 0 } : o));
  return run({ ...s, team: { ...s.team, operators: ops } }, 200);
}

// ORION-3 locked on a square (ILI-1397): nothing runs on a square it isn't over.
export const lockOn = (s: GameState, square: string): GameState => ({ ...s, satellite: initialSatellite(square) });

// A store for tests about what an action does, not about the satellite's move step: each action
// on a square first puts ORION-3 over it, as the player would have.
export function lockedStore(start?: GameState) {
  const store = createStore(start);
  const over = (square: string | undefined) => square && store.set(lockOn(store.get(), square));
  const eventSquare = (id: string) => store.get().events.find((e) => e.id === id)?.square;
  return {
    ...store,
    fire: (contactId: string, w: Parameters<typeof store.fire>[1]) => {
      over(eventSquare(`contact-${contactId}`) ?? store.get().contacts.find((c) => c.id === contactId)?.square);
      store.fire(contactId, w);
    },
    // Listen (ILI-1394): ORION-3 already over the traffic, so the intercept starts on the next tick.
    intercept: (id: string) => (over(eventSquare(id)), store.answerPrompt(id, 'satellite'), store.tick(0)),
    jam: (id: string) => (over(eventSquare(id)), store.jam(id)),
    search: (square: string) => (over(square), store.search(square)),
    scan: (square: string) => (over(square), store.scan(square)),
  };
}

// Play ALPHA's intel prompt the way the player does (ILI-1451): each step by hand. Click the grid
// square (ORION-3 goes), wait out the move, Scan in ORION-3, then Photo sends the intel to ALPHA.
// Call it every tick: it does the one step the prompt is on.
export function answerIntel(store: ReturnType<typeof createStore>, p: { kind: string; grid?: string; step?: string } | null | undefined) {
  if (p?.kind !== 'intel-needed' || !p.grid) return;
  const grid = p.grid;
  if (p.step === 'click') {
    store.selectSquare(grid);
    store.lookAt(grid);
  }
  if (p.step === 'scan') store.scan(grid);
  if (p.step === 'photo') store.photo(grid);
}
