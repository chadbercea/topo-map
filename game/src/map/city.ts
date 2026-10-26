import { WORLD_H, WORLD_W } from './grid';

// A fictional town for the city overlay: two highways through the theater, a street grid
// around the town centre and building footprints on its blocks. Seeded, like the terrain.

export type Block = { x: number; y: number; w: number; h: number };
export type City = { roads: [number, number][][]; streets: [number, number][][]; blocks: Block[] };

export const TOWN = { x: 900, y: 330, radius: 230 }; // centred in E2, spilling into D2 and the top of E3

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCity(seed = 11): City {
  const r = rng(seed);
  const wobble = (n: number) => (r() - 0.5) * n;

  // Highways cross the whole map and meet in town.
  const road = (from: [number, number], to: [number, number]): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const edge = Math.min(t, 1 - t) * 2; // straight near town, loose at the edges
      pts.push([from[0] + (to[0] - from[0]) * t + wobble(30 * edge), from[1] + (to[1] - from[1]) * t + wobble(30 * edge)]);
    }
    pts[8] = [TOWN.x, TOWN.y];
    return pts;
  };
  const roads = [road([0, TOWN.y + 60], [WORLD_W, TOWN.y - 80]), road([TOWN.x - 120, WORLD_H], [TOWN.x + 90, 0])];

  const STREET = 46;
  const streets: [number, number][][] = [];
  const blocks: Block[] = [];
  const inTown = (x: number, y: number) => Math.hypot(x - TOWN.x, y - TOWN.y) < TOWN.radius;
  for (let gx = TOWN.x - TOWN.radius; gx <= TOWN.x + TOWN.radius; gx += STREET) {
    for (let gy = TOWN.y - TOWN.radius; gy <= TOWN.y + TOWN.radius; gy += STREET) {
      if (!inTown(gx + STREET / 2, gy + STREET / 2)) continue;
      if (inTown(gx + STREET, gy)) streets.push([[gx, gy], [gx + STREET, gy]]);
      if (inTown(gx, gy + STREET)) streets.push([[gx, gy], [gx, gy + STREET]]);
      // Denser in the centre, patchy at the edge.
      const density = 1 - Math.hypot(gx - TOWN.x, gy - TOWN.y) / TOWN.radius;
      const count = Math.round(1 + density * 3);
      for (let k = 0; k < count; k++) {
        if (r() > 0.35 + density) continue;
        const w = 8 + r() * 14;
        const h = 8 + r() * 14;
        blocks.push({ x: gx + 5 + r() * (STREET - 10 - w), y: gy + 5 + r() * (STREET - 10 - h), w, h });
      }
    }
  }
  return { roads, streets, blocks };
}
