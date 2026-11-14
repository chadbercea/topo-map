import { describe, expect, it } from 'vitest';
import { squareCenter } from '../map/grid';
import { knownIn, knownSquare, moveContact, reveal } from './contacts';
import { ground } from './conditions';
import { squareFindings } from './intel';
import { blockers } from './progress';
import { sightings } from './sightings';
import { initialState as rolledState, type GameState } from './state';
import { fixed } from './testkit';
// A fixed enemy layout, not the rolled map (testkit FIXTURE, ILI-1544).
const initialState = (...a: Parameters<typeof rolledState>) => fixed(rolledState(...a));
import { fed, lockOn, lockedStore, run } from './testkit';

// Nothing about an enemy shows until ORION-3 has scanned the square it's in (ILI-1493). The one
// exception: ALPHA's own report of a square it's in contact on.
const hostiles = (s: GameState, square?: string) => sightings(s, new Map()).filter((x) => x.kind === 'hostile' && (!square || x.square === square));
const enemyNews = (s: GameState) => s.comms.messages.filter((m) => /contact|fighter|checkpoint|patrol/i.test(m.text) && m.from !== 'ALPHA');

describe('enemies show only once ORION-3 has scanned their square (ILI-1493)', () => {
  it('ORION-3 over an unscanned square shows nothing of the checkpoint there; the scan finds it', () => {
    let s = run(lockOn(fed(initialState()), 'E3'), 2_000);
    const checkpoint = s.contacts.find((c) => c.id === 'checkpoint')!;
    expect(checkpoint.status).toBe('hidden');
    expect(s.imagery.E3).toBeUndefined();
    expect(hostiles(s)).toEqual([]);
    expect(s.events.some((e) => e.kind === 'contact')).toBe(false);
    expect(enemyNews(s)).toEqual([]);
    expect(knownIn(s, 'E3')).toEqual([]);

    const store = lockedStore(s);
    store.scan('E3');
    s = store.get();
    expect(s.contacts.find((c) => c.id === 'checkpoint')!.status).toBe('revealed');
    expect(hostiles(s, 'E3').length).toBe(5);
    expect(knownSquare(s, s.contacts.find((c) => c.id === 'checkpoint')!)).toBe('E3');
  });

  it('a found group that walks off into unscanned ground stays where it was last seen on every instrument', () => {
    let s = reveal(fed(initialState()), ['C2'], 'ORION-3');
    s = moveContact(s, 'patrol', 'D3'); // the truth: it's in D3 now
    const patrol = s.contacts.find((c) => c.id === 'patrol')!;
    expect(knownSquare(s, patrol)).toBe('C2');
    expect(knownIn(s, 'D3')).toEqual([]);
    expect(ground(s, 'D3')!.contacts).toBe(0);
    expect(squareFindings(s, 'D3')).toBe('clear');
    expect(blockers(s).some((b) => b.text === 'Contact on the route at D3')).toBe(false);
  });

  it('ORION-3 watching a square it has scanned finds whoever walks in', () => {
    const s0 = fed(initialState());
    let s = lockOn({ ...s0, intel: { ...s0.intel, graded: ['D3'] } }, 'D3');
    s = run(moveContact(s, 'patrol', 'D3'), 200);
    expect(s.contacts.find((c) => c.id === 'patrol')!.status).toBe('revealed');
    expect(s.events.find((e) => e.id === 'contact-patrol')?.square).toBe('D3');
    expect(hostiles(s, 'D3').length).toBe(3);
  });

  it('the exception: ALPHA in contact on a square reports what is shooting at it, scanned or not', () => {
    const s0 = fed(initialState());
    // ALPHA walks into the observation post at C3, which nobody scanned.
    let s: GameState = { ...s0, team: { ...s0.team, position: squareCenter('C3')!, route: ['D3', 'C3', 'C2'], waypoint: 1 } };
    s = run(s, 200);
    expect(s.team.fight?.square).toBe('C3');
    expect(s.contacts.find((c) => c.id === 'post')!.status).toBe('revealed');
    expect(hostiles(s, 'C3').length).toBeGreaterThan(0); // ALPHA's own eyes
    expect(hostiles(s).every((h) => h.square === 'C3')).toBe(true); // nothing anywhere else
  });
});
