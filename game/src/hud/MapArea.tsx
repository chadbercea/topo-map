import { useLayoutEffect, useRef } from 'react';
import { bus, EV } from '../game/events';
import { COMPACT, MEDIUM, tier } from './tier';

// An empty grid cell between the panels. It reports its box so the map fits inside it,
// and passes input through to the canvas underneath. It also reports the open screen the
// grid covers (ILI-1186): below the phone's status line, right of the docked intel stream and above
// the bottom-right panels on a wide screen, above the dock on a phone. At the medium tier the
// panels sit in a rail on the right and the map runs under it (ILI-1213).
export function MapArea() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const stream = document.querySelector('.slot-satcom'); // the left column (COMMS, ILI-1225)
    const bottom = document.querySelector('.slot-bottom'); // the small widgets and TEAM (wide)
    const orion = document.querySelector('.slot-orion'); // ORION-3 down the right (wide)
    const small = document.querySelector('.slot-small'); // the small widgets' line (fold, phone)
    const tabs = document.querySelector('.dock-tabs');
    const widget = document.querySelector('.slot-widget');

    const tiers = [matchMedia(COMPACT), matchMedia(MEDIUM)];
    const report = () => {
      const t = tier();
      const { x, y, width, height } = el.getBoundingClientRect();
      const coverLeft = stream && t === 'wide' ? stream.getBoundingClientRect().right : 0;
      // The open map ends at the dock (phone), the small widgets' line (fold, tablet) or the
      // bottom row (wide, ILI-1226).
      const foot = (t === 'compact' ? tabs : t === 'medium' ? small : bottom)?.getBoundingClientRect().top;
      // On a phone the mission and the small widgets are rows of their own above the map;
      // on a fold the mission floats over the map's corner and the map runs to the top.
      const coverTop = t === 'compact' ? Math.max(widget?.getBoundingClientRect().bottom ?? 0, small?.getBoundingClientRect().bottom ?? 0) : 0;
      // The side rail (medium) and ORION-3's column (wide) are columns of their own: the grid
      // stops at their edge.
      const coverRight = t === 'medium' ? tabs?.getBoundingClientRect().left : t === 'wide' ? orion?.getBoundingClientRect().left : undefined;
      bus.emit(EV.mapRect, { x, y, width, height, coverLeft, coverTop, coverBottom: foot || undefined, coverRight });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    for (const other of [stream, bottom, orion, small, tabs, widget]) if (other) ro.observe(other);
    tiers.forEach((q) => q.addEventListener('change', report));
    report();
    return () => {
      ro.disconnect();
      tiers.forEach((q) => q.removeEventListener('change', report));
    };
  }, []);
  return <div ref={ref} className="map-area" data-testid="map-area" />;
}
