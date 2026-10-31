import { describe, expect, it } from 'vitest';
import { COLS, ROWS, squareId } from '../map/grid';
import { buildingId, FINDS, maybeBuilding, SEARCH_MS } from './buildings';
import type { GameState } from './state';
import { createStore } from './store';
import { run, walking } from './testkit';

// Buildings (ILI-1316): a photo of empty ground can turn up a building; HQ can send ALPHA to
// search it; what it finds pays on the spot.
const all = Array.from({ length: COLS * ROWS }, (_, i) => squareId(i % COLS, Math.floor(i / COLS)));
const withBuildings = (s: GameState) => all.filter((sq) => maybeBuilding(s, sq) !== s);

describe('buildings', () => {
  it('turn up on some empty squares, not all, and the same ones every replay', () => {
    const s = walking();
    const found = withBuildings(s);
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(all.length / 2);
    expect(withBuildings(walking())).toEqual(found);
  });

  it('a photo of an empty square with one pings it on the map', () => {
    const s0 = walking();
    const sq = withBuildings(s0).find((x) => !s0.contacts.some((c) => c.square === x))!;
    const store = createStore(s0);
    store.lookAt(sq);
    for (let i = 0; i < 300 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    store.capture('photo');
    expect(store.get().events.find((e) => e.id === buildingId(sq))).toMatchObject({ kind: 'building', square: sq, status: 'new' });
  });

  it('sent to search it, ALPHA detours there, searches, and what it finds pays on the spot', () => {
    const s0 = walking();
    // A building just off ALPHA's way: G4, next to G5 where it starts.
    const s1 = { ...s0, events: [...s0.events, { id: buildingId('G4'), kind: 'building' as const, square: 'G4', title: 'A building worth a search', atMs: 0, status: 'new' as const }] };
    const store = createStore(s1);
    store.search('G4');
    expect(store.get().team.route[store.get().team.waypoint]).toBe('G4');
    const before = store.get().resources.budget;
    let s = store.get();
    for (let t = 0; t < 120_000 && !s.comms.messages.some((m) => m.id === 'found-building-G4'); t += 100) s = run(s, 100);
    expect(s.comms.messages.some((m) => m.id === 'search-building-G4')).toBe(true);
    const found = s.comms.messages.find((m) => m.id === 'found-building-G4')!;
    const find = FINDS.find((f) => found.text.includes(f.what))!;
    expect(find).toBeTruthy();
    expect(s.resources.budget).toBe(before + find.cash);
    expect(s.events.find((e) => e.id === buildingId('G4'))?.status).toBe('resolved');
    expect(s.elapsedMs).toBeGreaterThanOrEqual(SEARCH_MS); // it took mission time
  });
});
