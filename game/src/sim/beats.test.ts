import { describe, expect, it } from 'vitest';
import { BEAT_MAX_MS, MOVE_MS } from './contacts';
import { initialState, type GameState } from './state';
import { run } from './testkit';
import { COLS, parseSquare, squareId } from '../map/grid';

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

  it('a group never sets off into the square ALPHA is walking into, or the one after (ILI-1583)', () => {
    const s0 = initialState();
    const ahead = s0.team.route.slice(s0.team.waypoint, s0.team.waypoint + 2);
    const c = s0.contacts[0];
    for (let seed = 1; seed < 200; seed++) {
      // One group, next to ALPHA's next square: wherever it goes, not there.
      const nextTo = ahead[0];
      const p = parseSquare(nextTo)!;
      const from = squareId(Math.min(COLS - 1, p.col + 1), p.row);
      const s = run({ ...s0, rng: seed, beatAtMs: 0, contacts: [{ ...c, square: from, move: undefined }] }, 100);
      const to = s.contacts[0].move?.to;
      if (to) expect(ahead).not.toContain(to);
    }
  });

  it('plays out the same way every time', () => {
    const a = run(initialState(), 120_000).contacts.map((c) => c.square);
    const b = run(initialState(), 120_000).contacts.map((c) => c.square);
    expect(a).toEqual(b);
  });
});
