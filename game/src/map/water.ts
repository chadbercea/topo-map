import type { Terrain } from './terrain';

// Rivers and streams (ILI-1191), worked out from the elevation like real ones: fill the
// pits so every sample drains to the edge of the map, send each sample's water to its lowest
// neighbour, and add up how much ground drains through each one. Where enough does, there's
// water. Seeded through the terrain, so it's the same map every time.

export type Water = {
  lines: { pts: [number, number][]; flow: number }[]; // world units; flow = catchment in samples
  wet: Uint8Array; // per terrain sample: 1 on a stream, 2 on a river
  t: Terrain;
};

export const STREAM = 300; // samples (25 m each way) draining through: a stream
export const RIVER = 1500; // and a river

// A small binary min-heap of sample indices by height.
function heap(key: Float64Array) {
  const a: number[] = [];
  const up = (i: number) => {
    while (i) {
      const p = (i - 1) >> 1;
      if (key[a[p]] <= key[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  };
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && key[a[l]] < key[a[m]]) m = l;
      if (r < a.length && key[a[r]] < key[a[m]]) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i], a[m]];
      i = m;
    }
  };
  return {
    push: (v: number) => (a.push(v), up(a.length - 1)),
    pop: () => {
      const top = a[0];
      const last = a.pop()!;
      if (a.length) (a[0] = last), down(0);
      return top;
    },
    get size() {
      return a.length;
    },
  };
}

const jitter = (k: number) => {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export function generateWater(t: Terrain): Water {
  const { cols, rows, heights } = t;
  const n = cols * rows;
  const filled = Float64Array.from(heights);
  const to = new Int32Array(n).fill(-1); // where each sample drains
  const seen = new Uint8Array(n);
  const order: number[] = []; // outlets first, sources last
  const q = heap(filled);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      if (i === 0 || j === 0 || i === cols - 1 || j === rows - 1) {
        seen[j * cols + i] = 1;
        q.push(j * cols + i);
      }
  // Priority flood: grow inward from the edge, lowest first; each sample drains to the one it
  // was reached from, and a pit is raised just enough to spill over.
  while (q.size) {
    const c = q.pop();
    order.push(c);
    const ci = c % cols;
    const cj = (c - ci) / cols;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if ((!di && !dj) || i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const k = j * cols + i;
        if (seen[k]) continue;
        seen[k] = 1;
        // Across a filled hollow the rise per step is jittered, so the water meanders over
        // the flat instead of running ruler-straight to the spill point.
        filled[k] = Math.max(filled[k], filled[c] + 1e-3 * (0.2 + jitter(k)));
        to[k] = c;
        q.push(k);
      }
  }
  const flow = new Float64Array(n).fill(1);
  for (let x = order.length - 1; x >= 0; x--) if (to[order[x]] >= 0) flow[to[order[x]]] += flow[order[x]];

  const wet = new Uint8Array(n);
  for (let k = 0; k < n; k++) wet[k] = flow[k] >= RIVER ? 2 : flow[k] >= STREAM ? 1 : 0;

  // Trace each channel from its source down to where it joins a bigger one or leaves the map.
  const at = (k: number): [number, number] => [t.x0 + (k % cols) * t.sample, t.y0 + Math.floor(k / cols) * t.sample];
  // A channel starts where no other channel feeds it.
  const fed = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (wet[k] && to[k] >= 0) fed[to[k]] = 1;
  const drawn = new Uint8Array(n);
  const lines: Water['lines'] = [];
  for (let k = 0; k < n; k++) {
    if (!wet[k] || fed[k]) continue; // not a source
    const pts: [number, number][] = [];
    let c = k;
    while (c >= 0 && wet[c]) {
      pts.push(at(c));
      if (drawn[c]) break; // joined a channel already drawn
      drawn[c] = 1;
      c = to[c];
    }
    if (pts.length > 1) lines.push({ pts, flow: flow[k] });
  }
  // Trunks: walk again from each source, splitting where the flow crosses into a river, so
  // rivers can be drawn heavier than the streams that feed them.
  const trunk: Water['lines'] = [];
  for (const l of lines) {
    let cur: [number, number][] = [];
    let river = false;
    for (const p of l.pts) {
      const k = Math.round((p[1] - t.y0) / t.sample) * cols + Math.round((p[0] - t.x0) / t.sample);
      const r = wet[k] === 2;
      if (r !== river && cur.length) {
        cur.push(p);
        trunk.push({ pts: cur, flow: river ? RIVER : STREAM });
        cur = [];
      }
      river = r;
      cur.push(p);
    }
    if (cur.length > 1) trunk.push({ pts: cur, flow: river ? RIVER : STREAM });
  }
  return { lines: trunk, wet, t };
}

// How wet the ground is at a world point: 0 dry, 1 a stream, 2 a river.
export function wetAt(w: Water, x: number, y: number) {
  const { t } = w;
  const i = Math.round((x - t.x0) / t.sample);
  const j = Math.round((y - t.y0) / t.sample);
  if (i < 0 || j < 0 || i >= t.cols || j >= t.rows) return 0;
  return w.wet[j * t.cols + i];
}
