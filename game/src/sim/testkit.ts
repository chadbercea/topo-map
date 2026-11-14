// Shared fixtures for the sim's unit tests.
import { initialState, ROUTE, type GameState } from './state';
import { createStore } from './store';
import { step } from './systems';
import { initialOrdnance, WEAPONS } from './ordnance';
import { LINK_MS } from './comms';
import { initialSatellite } from './satellite';
import { hearTraffic } from './enemy';
import { makeContact, type Contact } from './contacts';

// The real map is rolled square by square from the seed (roll.ts, ILI-1544). Tests about how a
// contact behaves use this fixed one instead: a dug-in group on the route at E3, a fire team at C2
// next to the crash site, a pair at C3. They hold where they are, like every group now.
export const FIXTURE = (): Contact[] => [
  makeContact('checkpoint', 'E3', 'a fortified checkpoint', 1.6, [1, 5, 6, 9, 10]),
  makeContact('patrol', 'C2', 'a foot patrol', 0.7, [1, 7, 12], 'MOVING TO D3 FOR THE DRONE', 'D3'), // its plan is intel to decode; it never sets off
  makeContact('post', 'C3', 'an observation post', 0.5, [10, 11]),
];
export const fixed = (s: GameState): GameState => ({ ...s, contacts: FIXTURE() });

// The sim's tests run with ALPHA's intel gauge pinned full, unless they're about the gauge
// (intel.test.ts): keeping the team fed is a game of its own (ILI-1314).
export const fed = (s: GameState): GameState => ({ ...s, intel: { ...s.intel, base: 100 }, ordnance: initialOrdnance(WEAPONS) }); // and every capability open (ILI-1316)

export const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};

// Run until a group talks on its net (ILI-1454): no fixed time, the mission's own rules and dice.
// On the default seed the patrol at C2 is first, before a minute is up.
// Enemy traffic up at C2, as a scan's SIGINT report brings it in (ILI-1359); ORION-3 stays where it is.
// The scan graded the square, so the tag shows there (ILI-1519).
export function untilTraffic(s: GameState, square = 'C2') {
  return hearTraffic({ ...s, intel: { ...s.intel, graded: [...new Set([...s.intel.graded, square])] } }, square);
}
// The enemy traffic up on the map (open, unless any will do).
export const trafficId = (s: GameState, open = true) => s.events.find((e) => e.kind === 'signal' && (!open || e.status !== 'resolved'))!.id;

// The team just walks: every square imaged and no contacts, so nothing stops it.
export const walking = (): GameState => {
  const s = fed(initialState());
  return { ...s, contacts: [], map: { ...s.map, scanned: [...ROUTE] } };
};

// HQ has sent ALPHA everything it found (ILI-1495): every found contact is in ALPHA's picture, where
// it is. For tests about what ALPHA does with what it knows, not how it came to know it.
export const told = (s: GameState): GameState => ({
  ...s,
  team: { ...s.team, known: Object.fromEntries(s.contacts.filter((c) => c.status === 'revealed').map((c) => [c.id, { square: c.square, units: c.units.length, atMs: s.elapsedMs }])) },
});

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

// ALPHA pulls what's on the shelf (ILI-1499): run until no package is waiting for it (posted or
// coming down), so what HQ posted is in ALPHA's picture and gauge.
export function pulled(s: GameState, maxMs = 60_000) {
  const pending = (x: GameState) => x.intel.pushes.some((p) => p.state === 'posted' || p.state === 'pulling');
  for (let t = 0; t < maxMs && pending(s); t += 100) s = step(s, 100);
  return s;
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
    postBuilding: (square: string) => (over(square), store.postBuilding(square)),
    scan: (square: string) => (over(square), store.scan(square)),
  };
}

// Play ALPHA's intel prompt the way the player does (ILI-1451): each step by hand. Click the grid
// square (ORION-3 goes), wait out the move, then Analyze in ORION-3. Its package goes on the shelf
// and ALPHA pulls it by itself (ILI-1499): no send step.
// Call it every tick: it does the one step the prompt is on.
export function answerIntel(store: ReturnType<typeof createStore>, p: { kind: string; grid?: string; step?: string } | null | undefined) {
  if (p?.kind !== 'intel-needed' || !p.grid) return;
  const grid = p.grid;
  if (p.step === 'click') {
    store.selectSquare(grid);
    store.lookAt(grid);
  }
  if (p.step === 'analyze') store.scan(grid);
}
