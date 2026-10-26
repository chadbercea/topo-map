import { describe, expect, it } from 'vitest';
import { CELL, parseSquare, squareAt, squareCenter, squareId, WORLD_H, WORLD_W } from './grid';

describe('grid', () => {
  it('names squares column letter then row number', () => {
    expect(squareId(0, 0)).toBe('A1');
    expect(squareId(7, 4)).toBe('H5');
    expect(parseSquare('C2')).toEqual({ col: 2, row: 1 });
  });

  it('rejects squares off the grid', () => {
    expect(parseSquare('I1')).toBeNull();
    expect(parseSquare('A6')).toBeNull();
    expect(parseSquare('A0')).toBeNull();
    expect(parseSquare('banana')).toBeNull();
    expect(squareAt(-1, 10)).toBeNull();
    expect(squareAt(WORLD_W, 10)).toBeNull();
    expect(squareAt(10, WORLD_H)).toBeNull();
  });

  it('maps world points to squares and back', () => {
    expect(squareAt(CELL * 2 + 1, CELL + 1)).toBe('C2');
    const c = squareCenter('C2')!;
    expect(squareAt(c.x, c.y)).toBe('C2');
  });
});
