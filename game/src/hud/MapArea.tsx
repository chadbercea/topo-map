import { useLayoutEffect, useRef } from 'react';
import { bus, EV } from '../game/events';
import { COMPACT, MEDIUM, tier } from './tier';

// An empty grid cell between the panels. It reports its box so the map fits inside it,
// and passes input through to the canvas underneath. It also reports the open screen the
// grid covers (ILI-1186): below the mission bar, right of the docked intel stream and above
// the bottom-right panels on a wide screen, above the dock on a phone. At the medium tier the
// panels sit in a rail on the right and the map runs under it (ILI-1213).
export function MapArea() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const stream = document.querySelector('.slot-stream');
    const team = document.querySelector('.slot-team');
    const tabs = document.querySelector('.dock-tabs');
    const bar = document.querySelector('.slot-bar');
    const tiers = [matchMedia(COMPACT), matchMedia(MEDIUM)];
    const report = () => {
      const t = tier();
      const { x, y, width, height } = el.getBoundingClientRect();
      const coverLeft = stream && t === 'wide' ? stream.getBoundingClientRect().right : 0;
      const bottom = t === 'medium' ? undefined : (t === 'compact' ? tabs : team)?.getBoundingClientRect().top;
      // On a phone HQ's assets sit in their own row under the header (once linked).
      const assets = t === 'compact' ? document.querySelector('.assets') : null;
      const coverTop = Math.max(bar?.getBoundingClientRect().bottom ?? 0, assets?.getBoundingClientRect().bottom ?? 0);
      // The side rail (medium) is a column of its own: the grid stops at its edge.
      const coverRight = t === 'medium' ? tabs?.getBoundingClientRect().left : undefined;
      bus.emit(EV.mapRect, { x, y, width, height, coverLeft, coverTop, coverBottom: bottom || undefined, coverRight });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    for (const other of [stream, team, tabs, bar]) if (other) ro.observe(other);
    tiers.forEach((q) => q.addEventListener('change', report));
    report();
    return () => {
      ro.disconnect();
      tiers.forEach((q) => q.removeEventListener('change', report));
    };
  }, []);
  return <div ref={ref} className="map-area" data-testid="map-area" />;
}
