import { useEffect, useState } from 'react';

// The layout tier (ILI-1213), from the window's width alone, so a near-square fold keeps its
// layout as it turns. Matches the width queries in styles.css.
//   compact  < 700 px: phones upright. The map, then one tabbed dock under it.
//   medium   700–1199: a fold open either way, tablets, phones sideways. The map, and a side
//            rail with the panels behind tabs; a square opened on the map takes over the rail.
//   wide     ≥ 1200: the full war room.
export type Tier = 'compact' | 'medium' | 'wide';
export const COMPACT = '(max-width: 699px)';
export const MEDIUM = '(min-width: 700px) and (max-width: 1199px)';

export const tier = (): Tier => (matchMedia(COMPACT).matches ? 'compact' : matchMedia(MEDIUM).matches ? 'medium' : 'wide');

export function useTier(): Tier {
  const [t, setT] = useState(tier);
  useEffect(() => {
    const queries = [matchMedia(COMPACT), matchMedia(MEDIUM)];
    const on = () => setT(tier());
    queries.forEach((q) => q.addEventListener('change', on));
    return () => queries.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return t;
}
