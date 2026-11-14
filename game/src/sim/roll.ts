import { COLS, ROWS, squareId, type SquareId } from '../map/grid';
import { makeContact, neighbours, type Contact } from './contacts';
import { dice } from './enemy';

// What every square holds is rolled once, at mission start, and stays hidden (ILI-1544). Nobody
// authors where the enemy is: each square draws from the same bucket of potentials (nothing, intel,
// enemies, or both) on the mission's dice, so a seed replays exactly and a new seed is a new map.
// A scan only reveals what's already there; ALPHA can walk into it scanned or not.
//
// - Intel: the square's worth to the analysts, rolled by square (intel.ts grade).
// - Enemies: ENEMY_CHANCE of a group, 2 to 6 fighters standing in cells of the 4x4 board over the
//   square. They hold where they are: no patrols, no plans, no scripted moves.
// The insert square and the ground around it roll no enemies, so ALPHA isn't in contact on landing.

export const ENEMY_CHANCE = 0.22;
export const GROUP_SIZE = [2, 6] as const;
export const GROUP_STRENGTH = [0.5, 1.2] as const;

const CELLS = 16;

export function rollGroup(seed: number, square: SquareId): Contact | null {
  if (dice(seed, `enemy-${square}`) >= ENEMY_CHANCE) return null;
  const [lo, hi] = GROUP_SIZE;
  const size = lo + Math.floor(dice(seed, `size-${square}`) * (hi - lo + 1));
  const strength = Math.round((GROUP_STRENGTH[0] + dice(seed, `str-${square}`) * (GROUP_STRENGTH[1] - GROUP_STRENGTH[0])) * 10) / 10;
  const free = Array.from({ length: CELLS }, (_, i) => i);
  const units: number[] = [];
  for (let i = 0; i < size; i++) units.push(free.splice(Math.floor(dice(seed, `cell-${square}-${i}`) * free.length), 1)[0]);
  const label = size <= 3 ? 'a fire team' : 'an armed squad';
  return makeContact(`group-${square.toLowerCase()}`, square, label, strength, units.sort((a, b) => a - b));
}

export function rollContacts(seed: number, insert: SquareId): Contact[] {
  const clear = new Set([insert, ...neighbours(insert)]);
  const out: Contact[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const sq = squareId(col, row);
      if (clear.has(sq)) continue;
      const g = rollGroup(seed, sq);
      if (g) out.push(g);
    }
  return out;
}
