// The theater grid: columns A–H left to right, rows 1–5 top to bottom. Everything that
// happens on the map (scans, markers, events, the team) is addressed by square id, e.g. "C2".

export const COLS = 8;
export const ROWS = 5;
export const CELL = 200; // world units per square
export const WORLD_W = COLS * CELL;
export const WORLD_H = ROWS * CELL;

export type SquareId = string;

export const squareId = (col: number, row: number): SquareId => `${String.fromCharCode(65 + col)}${row + 1}`;

export function parseSquare(id: SquareId): { col: number; row: number } | null {
  const m = /^([A-Z])(\d+)$/.exec(id);
  if (!m) return null;
  const col = m[1].charCodeAt(0) - 65;
  const row = Number(m[2]) - 1;
  return col < COLS && row >= 0 && row < ROWS ? { col, row } : null;
}

export function squareAt(x: number, y: number): SquareId | null {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return null;
  return squareId(Math.floor(x / CELL), Math.floor(y / CELL));
}

export function squareCenter(id: SquareId): { x: number; y: number } | null {
  const sq = parseSquare(id);
  return sq && { x: (sq.col + 0.5) * CELL, y: (sq.row + 0.5) * CELL };
}
