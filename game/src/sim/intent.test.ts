import { describe, expect, it } from 'vitest';
import { intentOf } from './signal';
import { initialState } from './state';
import { makeContact } from './contacts';

// Intercepts say what the group is really doing (ILI-1570), not HOLD POSITION every time.
describe('what an intercept decodes to', () => {
  const s = initialState();
  const ahead = s.team.route[s.team.route.length - 1];
  const off = ['A1', 'A2', 'B1', 'H8', 'H1', 'A8'].find((sq) => !s.team.route.includes(sq))!;
  it('on the move: where to', () => {
    const c = { ...makeContact('x', off, 't', 1, [0, 1]), move: { from: off, to: 'B2', fromMs: 0, arriveMs: 1 } };
    expect(intentOf(s, c)).toBe('MOVING TO B2');
  });
  it("sat on ALPHA's way ahead: an ambush", () => {
    expect(intentOf(s, makeContact('x', ahead, 't', 1, [0, 1]))).toBe(`SET AMBUSH AT ${ahead}`);
  });
  it('dug in: holding; otherwise hold position', () => {
    expect(intentOf(s, makeContact('x', off, 't', 1.5, [0, 1]))).toBe('DUG IN, HOLDING');
    expect(intentOf(s, makeContact('x', off, 't', 1, [0, 1]))).toBe('HOLD POSITION');
  });
});
