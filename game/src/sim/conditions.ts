import { CELL, METRES_PER_UNIT, parseSquare, squareId, type SquareId } from '../map/grid';
import { heightAt, theater } from '../map/terrain';
import { generateCity, TOWN } from '../map/city';
import { TIME_SCALE } from './gameTime';
import type { GameState } from './state';

// Conditions over the area of operations (ILI-1187), for the header: the weather, the light,
// and what HQ can know about the ground in view. Informational for now. Cloud cover is kept
// as a number so a later mission can let fog, cloud or a storm blind ORION-3 (imageryOk).

export type Weather = {
  sky: string;
  cloudPct: number;
  visibilityKm: number;
  wind: { from: string; kmh: number };
  tempC: number;
  light: 'Night' | 'First light' | 'Day';
};

// The morning's forecast over the AO, by game minutes since 0540Z: high cloud breaking up
// as the sun gets up.
const FORECAST: (Omit<Weather, 'light' | 'tempC'> & { fromMin: number })[] = [
  { fromMin: 0, sky: 'High cloud', cloudPct: 60, visibilityKm: 6, wind: { from: 'NW', kmh: 10 } },
  { fromMin: 90, sky: 'Broken cloud', cloudPct: 40, visibilityKm: 10, wind: { from: 'NW', kmh: 14 } },
  { fromMin: 170, sky: 'Clear', cloudPct: 10, visibilityKm: 15, wind: { from: 'W', kmh: 18 } },
];
const SUNRISE_MIN = 32; // 0612Z

export function weather(s: GameState): Weather {
  const min = (s.elapsedMs * TIME_SCALE) / 60_000;
  const now = [...FORECAST].reverse().find((f) => min >= f.fromMin) ?? FORECAST[0];
  const { fromMin: _, ...w } = now;
  const light = min < SUNRISE_MIN - 25 ? 'Night' : min < SUNRISE_MIN + 20 ? 'First light' : 'Day';
  return { ...w, tempC: Math.round(8 + Math.max(0, min) / 25), light };
}

// Clear enough for ORION-3 to see the ground. Not wired to anything yet.
export const imageryOk = (w: Weather) => w.cloudPct < 80;

export type Ground = {
  square: SquareId;
  lowM: number;
  highM: number;
  slope: 'flat' | 'rolling' | 'steep';
  features: string[]; // town, road
  imagery: string; // what HQ has seen of it
  contacts: number; // found contacts in it
};

let roads: [number, number][] | null = null;
const roadPoints = () => (roads ??= generateCity().roads.flat());

// What HQ knows about one square: its height and slope from the elevation data, what's on it,
// and what imagery and contacts it has.
export function ground(s: GameState, square: SquareId): Ground | null {
  const sq = parseSquare(square);
  if (!sq) return null;
  const t = theater();
  const x0 = sq.col * CELL;
  const y0 = sq.row * CELL;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const h = heightAt(t, x0 + (i * CELL) / 4, y0 + (j * CELL) / 4);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  const grade = (high - low) / (CELL * METRES_PER_UNIT);
  const features: string[] = [];
  if (Math.hypot(x0 + CELL / 2 - TOWN.x, y0 + CELL / 2 - TOWN.y) < TOWN.radius + CELL / 3) features.push('town');
  if (roadPoints().some(([x, y]) => x >= x0 && x < x0 + CELL && y >= y0 && y < y0 + CELL)) features.push('road');
  const snap = s.imagery[square];
  const imagery = snap ? 'imaged' : s.map.scanned.includes(square) ? 'known ground' : 'no imagery';
  return {
    square,
    lowM: Math.round(low),
    highM: Math.round(high),
    slope: grade < 0.08 ? 'flat' : grade < 0.2 ? 'rolling' : 'steep',
    features,
    imagery,
    contacts: s.contacts.filter((c) => c.square === square && c.status === 'revealed').length,
  };
}

// The square the header describes: the one HQ has selected, else where ALPHA is.
export function groundInView(s: GameState): Ground | null {
  if (s.map.selected) return ground(s, s.map.selected);
  const { x, y } = s.team.position;
  return ground(s, squareId(Math.floor(x / CELL), Math.floor(y / CELL)));
}
