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

// A fold open upright, or a tablet held tall (ILI-1461): the medium tier on a screen taller than it is
// wide. The map on top, ORION-3 docked under it, the team and comms along the bottom.
export const FOLD = '(min-width: 700px) and (max-width: 1199px) and (orientation: portrait)';
export const isFold = () => matchMedia(FOLD).matches;
export function useFold(): boolean {
  const [f, setF] = useState(isFold);
  useEffect(() => {
    const q = matchMedia(FOLD);
    const on = () => setF(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return f;
}
