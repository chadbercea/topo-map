import { CELL, METRES_PER_UNIT, parseSquare, squareAt, squareCenter, WORLD_H, WORLD_W, type SquareId } from './grid';
import { heightAt, theater } from './terrain';
import { generateCity } from './city';
import { generateWater, wetAt, type Water } from './water';

// How ALPHA crosses the ground (ILI-1191): not a straight line from square to square, but
// the way a patrol would go. A* over 50 m cells, kept inside the two squares of the leg (so
// it never wanders into a square HQ hasn't looked at), where climbing costs what it costs
// on foot, a road is quick, the dry bank beside a stream is easy going, and wading across
// water is slow.

export const STEP = 20; // world units per path cell (50 m)
const COLS = WORLD_W / STEP;
const ROWS = WORLD_H / STEP;

let water: Water | undefined;
export const theaterWater = () => (water ??= generateWater(theater()));

let roads: Uint8Array | undefined;
// Cells a road or street runs through.
function roadCells() {
  if (roads) return roads;
  roads = new Uint8Array(COLS * ROWS);
  const { roads: r, streets } = generateCity();
  for (const line of [...r, ...streets])
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1];
      const [x1, y1] = line[i];
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (STEP / 2));
      for (let k = 0; k <= n; k++) {
        const c = Math.floor((x0 + ((x1 - x0) * k) / n) / STEP);
        const rr = Math.floor((y0 + ((y1 - y0) * k) / n) / STEP);
        if (c >= 0 && rr >= 0 && c < COLS && rr < ROWS) roads[rr * COLS + c] = 1;
      }
    }
  return roads;
}

const centre = (k: number) => ({ x: ((k % COLS) + 0.5) * STEP, y: (Math.floor(k / COLS) + 0.5) * STEP });

// What a step from cell a to neighbour b costs, in metres-on-the-flat.
function stepCost(a: number, b: number) {
  const t = theater();
  const w = theaterWater();
  const p = centre(a);
  const q = centre(b);
  const run = Math.hypot(q.x - p.x, q.y - p.y) * METRES_PER_UNIT;
  const grade = (heightAt(t, q.x, q.y) - heightAt(t, p.x, p.y)) / run;
  let cost = run * (1 + 4 * Math.max(0, grade) + 1.5 * Math.max(0, -grade - 0.15)); // steep descents are slow too
  const wet = wetAt(w, q.x, q.y);
  if (roadCells()[b]) cost *= 0.55;
  else if (wet === 2) cost *= 4; // fording a river
  else if (wet === 1) cost *= 1.6; // a stream bed
  else if (wetAt(w, q.x + STEP, q.y) || wetAt(w, q.x - STEP, q.y) || wetAt(w, q.x, q.y + STEP) || wetAt(w, q.x, q.y - STEP)) cost *= 0.8; // along the bank
  return cost;
}

// The path from a world point to the centre of a square, through cells in the allowed squares.
export function findPath(from: { x: number; y: number }, toSquare: SquareId, via: SquareId[]): { x: number; y: number }[] {
  const goal = squareCenter(toSquare)!;
  const allowed = new Set([...via, toSquare].map((s) => parseSquare(s)).filter(Boolean).map((s) => `${s!.col},${s!.row}`));
  const ok = (k: number) => {
    const c = centre(k);
    return allowed.has(`${Math.floor(c.x / CELL)},${Math.floor(c.y / CELL)}`);
  };
  const cell = (p: { x: number; y: number }) => Math.min(ROWS - 1, Math.max(0, Math.floor(p.y / STEP))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(p.x / STEP)));
  const start = cell(from);
  const end = cell(goal);
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = new Set([start]);
  const h = (k: number) => {
    const c = centre(k);
    return Math.hypot(c.x - goal.x, c.y - goal.y) * METRES_PER_UNIT * 0.5; // admissible: roads halve the cost
  };
  const f = new Map<number, number>([[start, h(start)]]);
  while (open.size) {
    let cur = -1;
    for (const k of open) if (cur < 0 || f.get(k)! < f.get(cur)!) cur = k;
    if (cur === end) break;
    open.delete(cur);
    const ci = cur % COLS;
    const cj = (cur - ci) / COLS;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if ((!di && !dj) || i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
        const k = j * COLS + i;
        if (k !== end && !ok(k)) continue;
        const tentative = g.get(cur)! + stepCost(cur, k);
        if (tentative < (g.get(k) ?? Infinity)) {
          came.set(k, cur);
          g.set(k, tentative);
          f.set(k, tentative + h(k));
          open.add(k);
        }
      }
  }
  if (!came.has(end) && start !== end) return [goal];
  const cells: number[] = [];
  for (let k = end; k !== start; k = came.get(k)!) cells.push(k);
  const pts = cells.reverse().map(centre);
  pts[pts.length - 1] = goal;
  return pts;
}

// A leg between two route squares, for drawing the route ahead; cached, since it never changes.
const legs = new Map<string, { x: number; y: number }[]>();
export function legPath(from: SquareId, to: SquareId) {
  const key = `${from}>${to}`;
  if (!legs.has(key)) legs.set(key, [squareCenter(from)!, ...findPath(squareCenter(from)!, to, [from])]);
  return legs.get(key)!;
}

// The squares a leg may cross: the one ALPHA is in, and the one it's heading for.
export const legSquares = (pos: { x: number; y: number }) => [squareAt(pos.x, pos.y)].filter((s): s is SquareId => !!s);
