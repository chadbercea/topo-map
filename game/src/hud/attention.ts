import { useEffect, useState, type RefObject } from 'react';
import { useGame } from '../sim/store';

// Something changed in a panel HQ can't see (ILI-1287). On a fold or phone the panels share
// tabs: a tab whose panel has news HQ hasn't looked at carries an orange dot until it's opened.
// Where a panel is in view, its frame flashes a little brighter instead.

// Whether `sig` has moved on since its panel was last open. A new mission starts it fresh.
export function useUnseen(sig: string | number, open: boolean) {
  const [seen, setSeen] = useState(sig);
  const fresh = useGame((s) => s.elapsedMs === 0);
  useEffect(() => {
    if (open || fresh) setSeen(sig);
  }, [open, fresh, sig]);
  return !open && sig !== seen;
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The panel in `slot` brightens its frame for a moment each time `sig` changes while it's shown.
export function useFlash(slot: RefObject<HTMLElement | null>, sig: string | number, shown: boolean) {
  const [last, setLast] = useState(sig);
  useEffect(() => {
    if (sig === last) return;
    setLast(sig);
    const panel = slot.current?.querySelector<HTMLElement>(':scope > .panel');
    if (!shown || !panel || still()) return;
    panel.animate(
      [{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px rgba(53, 208, 165, 0.5), 0 0 16px rgba(53, 208, 165, 0.28)' }, {}],
      { duration: 900, easing: 'ease-out' },
    );
  }, [slot, sig, last, shown]);
}
