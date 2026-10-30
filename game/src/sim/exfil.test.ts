import { describe, expect, it } from 'vitest';
import { squareAt } from '../map/grid';
import { aboard, BOARD_MS, EXFIL_FLIGHT_MS, exfilStage, transportAt } from './exfil';
import type { GameState } from './state';
import { run, walking } from './testkit';

const until = (s: GameState, done: (x: GameState) => boolean, maxMs = 600_000) => {
  for (let t = 0; t < maxMs && !done(s); t += 100) s = run(s, 100);
  return s;
};
const inC = (s: GameState) => squareAt(s.team.position.x, s.team.position.y) === s.mission.c;

describe('the exfil sequence (ILI-1264)', () => {
  it('is called in once ALPHA is in the exfil square with the black box and it is clear: the pilot confirms', () => {
    const s = until(walking(), (x) => !!x.exfil);
    expect(inC(s)).toBe(true);
    expect(s.mission.blackBox).toBe(true);
    expect(s.exfil).toMatchObject({ square: 'B1', arriveMs: s.elapsedMs + EXFIL_FLIGHT_MS, boardMs: null });
    expect(s.comms.messages.at(-1)).toMatchObject({ id: 'exfil-called', from: 'RAVEN-6' });
    expect(s.phase).toBe('running');
  });

  it('waits while anyone is still in the square', () => {
    const s0 = until(walking(), (x) => x.mission.phase === 'exfil');
    const enemy = { ...s0, contacts: [{ id: 'x', square: 'B1', status: 'revealed', units: [0], label: 'fighters' }] } as unknown as GameState;
    // Take ALPHA's fight out of it: only the square being occupied should hold the bird.
    let s = enemy;
    for (let t = 0; t < 300_000 && !inC(s); t += 100) s = run({ ...s, team: { ...s.team, fight: null } }, 100);
    s = run({ ...s, team: { ...s.team, fight: null } }, 2_000);
    expect(s.exfil).toBeNull();
  });

  it('stops the clock, flies in, boards the five one at a time, leaves the square, then ends', () => {
    let s = until(walking(), (x) => !!x.exfil);
    const r0 = s.exfil!;
    const clock = s.timer.remainingMs;
    expect(exfilStage(r0, s.elapsedMs)).toBe('enroute');
    expect(transportAt(r0, s.elapsedMs)).toBeNull();
    s = run(s, EXFIL_FLIGHT_MS + 1_000);
    expect(s.timer.remainingMs).toBe(clock);
    expect(transportAt(s.exfil!, s.elapsedMs)).not.toBeNull();

    s = until(s, (x) => x.exfil!.boardMs !== null);
    const r = s.exfil!;
    expect(s.comms.messages.at(-1)).toMatchObject({ id: 'exfil-down', from: 'RAVEN-6' });
    const ids = s.team.operators.map((o) => o.id);
    const counts = [1, 2, 3, 4, 5].map((n) => aboard(r, ids, r.boardMs! + n * BOARD_MS).length);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    expect(aboard(r, ids, r.boardMs! + BOARD_MS - 1)).toEqual([]);

    s = until(s, (x) => x.phase === 'ended');
    expect(s.mission.phase).toBe('complete');
    expect(exfilStage(s.exfil!, s.elapsedMs)).toBe('done');
    expect(transportAt(s.exfil!, s.elapsedMs)).toBeNull();
    expect(s.comms.messages.find((m) => m.id === 'exfil')?.text).toMatch(/We're out/);
  });
});
