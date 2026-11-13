import { describe, expect, it } from 'vitest';
import { COLS, ROWS, squareId } from '../map/grid';
import { buildingId, FINDS, maybeBuilding, SEARCH_MS } from './buildings';
import type { GameState } from './state';
import { lockedStore as createStore } from './testkit';
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

// Inside, searching (ILI-1418): the team is off the map until the search is done.
import { searchingIn as inside } from './buildings';
import { teamStatus as statusOf } from './team';
import { squareAt as at } from '../map/grid';
import { initialState } from './state';
describe('searching a building', () => {
  it('puts ALPHA inside while it searches, and back out when it is done', () => {
    const s0 = initialState();
    const here = at(s0.team.position.x, s0.team.position.y)!;
    const s = { ...s0, searching: [here], team: { ...s0.team, holdUntilMs: 20_000, activity: `Searching the building in ${here}` } };
    expect(inside(s)).toBe(here);
    expect(statusOf(s)).toBe('Searching');
    const done = { ...s, elapsedMs: 20_000 };
    expect(inside(done)).toBeNull();
  });
});

// Every search turns up supplies on top of its find (ILI-1434).
import { resupplied } from './buildings';
import { LOADOUT } from './team';
describe('supplies from a search', () => {
  it('gives each standing operator half a loadout of ammo and meds back, up to full', () => {
    const s0 = initialState();
    const worn = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i === 4 ? { ...o, health: 0, ammo: 0, meds: 0 } : { ...o, ammo: 0, meds: 0 })) } };
    const ops = resupplied(worn);
    const lead = ops[0];
    expect(lead.ammo).toBe(Math.round(LOADOUT[lead.role].ammo * 0.5));
    expect(lead.meds).toBeGreaterThan(0);
    expect(ops[4].ammo).toBe(0); // a man down carries nothing out
    const full = resupplied(s0);
    expect(full[0].ammo).toBe(LOADOUT[full[0].role].ammo); // never past a full loadout
  });
});

// Reaching a building (ILI-1518): ALPHA plans the way on what it knows of the enemy, around any
// contact it wouldn't take, and drops the search if it later goes around the building.
import { reach, sendToSearch } from './buildings';
import { makeContact } from './contacts';
import { parseSquare } from '../map/grid';
import { told } from './testkit';
const building = (s: GameState, sq: string): GameState => ({ ...s, events: [...s.events, { id: buildingId(sq), kind: 'building' as const, square: sq, title: 'A building worth a search', atMs: 0, status: 'new' as const }] });
const strong = (id: string, sq: string) => ({ ...makeContact(id, sq, 'a dug-in squad', 5, [0, 1, 2, 3]), status: 'revealed' as const });
const weak = (id: string, sq: string) => ({ ...makeContact(id, sq, 'a lookout', 0.5, [0]), status: 'revealed' as const });
const withContacts = (s: GameState, cs: ReturnType<typeof strong>[], tell = true): GameState => {
  const next = { ...s, contacts: cs };
  return tell ? told(next) : next;
};
const chained = (route: string[]) =>
  route.every((sq, i) => {
    if (!i) return true;
    const a = parseSquare(route[i - 1])!;
    const b = parseSquare(sq)!;
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) === 1;
  });

describe('reaching a building', () => {
  it('goes the long way round a contact ALPHA knows of, square by square, and back onto its route', () => {
    const s = building(withContacts(walking(), [strong('wall', 'F5')]), 'E5');
    const r = reach(s, 'E5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route).not.toContain('F5');
    expect(r.route).toContain('E5');
    expect(chained(r.route)).toBe(true);
    expect(r.route.slice(-4)).toEqual(['E3', 'D3', 'C2', 'B1']); // back on its way
  });

  it('can’t reach a building with a contact in it ALPHA won’t take', () => {
    const s = building(withContacts(walking(), [strong('inside', 'E5')]), 'E5');
    expect(reach(s, 'E5')).toEqual({ ok: false, why: 'contact', at: 'E5' });
    const sent = sendToSearch(s, 'E5');
    expect(sent.searching).toEqual([]);
    expect(sent.team.route).toEqual(s.team.route);
  });

  it('goes in on a contact it would take anyway', () => {
    const s = building(withContacts(walking(), [weak('lookout', 'E5')]), 'E5');
    expect(reach(s, 'E5').ok).toBe(true);
  });

  it('can’t reach a building every way to which runs into contact', () => {
    const s = building(withContacts(walking(), [strong('a', 'G1'), strong('b', 'G2'), strong('c', 'H2')]), 'H1');
    expect(reach(s, 'H1')).toEqual({ ok: false, why: 'cut-off', at: 'H1' });
  });

  it('only weighs what ALPHA knows: a contact it was never told of is no obstacle', () => {
    const s = building(withContacts(walking(), [strong('inside', 'E5')], false), 'E5');
    expect(reach(s, 'E5').ok).toBe(true);
  });

  it('drops the search once ALPHA goes around the building, and the building waits for HQ again', () => {
    const s0 = sendToSearch(building(walking(), 'G4'), 'G4');
    expect(s0.searching).toEqual(['G4']);
    // A contact turns up in G4 and ALPHA swings round it: G4 is off its route.
    const rerouted = { ...s0, team: { ...s0.team, route: s0.team.route.map((sq) => (sq === 'G4' ? 'H4' : sq)) } };
    const s = run(rerouted, 100);
    expect(s.searching).toEqual([]);
    expect(s.events.find((e) => e.id === buildingId('G4'))?.status).toBe('new');
  });
});
