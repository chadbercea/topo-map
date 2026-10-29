import { describe, expect, it } from 'vitest';
import { gameClock, gameSpan } from './gameTime';

describe('game time', () => {
  it('reads the ten-minute window as four hours', () => {
    expect(gameClock(10 * 60_000)).toBe('4:00');
    expect(gameClock(0)).toBe('0:00');
  });

  it('counts down rounding up, and stamps rounding down', () => {
    expect(gameClock(1_000)).toBe('0:01');
    expect(gameClock(1_000, Math.floor)).toBe('0:00');
    expect(gameClock(150_000, Math.floor)).toBe('1:00');
    expect(gameClock(149_000, Math.floor)).toBe('0:59');
  });

  it('says spans in minutes, then hours', () => {
    expect(gameSpan(5_000)).toBe('2 min');
    expect(gameSpan(150_000)).toBe('1 h');
    expect(gameSpan(167_500)).toBe('1 h 7 min');
    expect(gameSpan(-5)).toBe('0 min');
  });
});
