import { describe, expect, it } from 'vitest';
import { BEAT_MAX_MS, MOVE_MS } from './contacts';
import { initialState, type GameState } from './state';
import { run } from './testkit';
import { parseSquare } from '../map/grid';

// No dead air (ILI-1565): every 30–45 s a group sets off for the next square.
describe('the ground moves', () => {
  it('within a beat a group sets off, and arrives a little later', () => {
    let s: GameState = initialState();
    s = run(s, BEAT_MAX_MS + 1_000);
    const mover = s.contacts.find((c) => c.move);
    expect(mover).toBeTruthy();
    const to = mover!.move!.to;
    s = run(s, MOVE_MS + 500);
    expect(s.contacts.find((c) => c.id === mover!.id)!.square).toBe(to);
  });

  it('a group HQ found gets an analysts’ call when it moves; one nobody found moves silently', () => {
    const s0 = initialState();
    const all = { ...s0, contacts: s0.contacts.map((c) => ({ ...c, status: 'revealed' as const })) };
    const s = run(all, BEAT_MAX_MS + 1_000);
    expect(s.comms.messages.some((m) => m.from === 'Analysts' && /movement: \d+ dismounts heading (north|south|east|west)\./.test(m.text))).toBe(true);
    const quiet = run(s0, BEAT_MAX_MS + 1_000);
    expect(quiet.comms.messages.some((m) => /movement:/.test(m.text))).toBe(false);
  });

  it('over a mission, groups close on ALPHA\'s way ahead (ILI-1571)', () => {
    const s0 = initialState();
    const ahead = s0.team.route.slice(s0.team.waypoint);
    const gap = (a: string, b: string) => { const p = parseSquare(a)!, q = parseSquare(b)!; return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row)); };
    const distance = (s: GameState) => s.contacts.reduce((n, c) => n + Math.min(...ahead.map((r) => gap(c.square, r))), 0);
    expect(distance(run(s0, 500_000))).toBeLessThan(distance(s0) - 3);
  });

  it('plays out the same way every time', () => {
    const a = run(initialState(), 120_000).contacts.map((c) => c.square);
    const b = run(initialState(), 120_000).contacts.map((c) => c.square);
    expect(a).toEqual(b);
  });
});
