import { useLayoutEffect, useRef } from 'react';
import { bus, EV } from '../game/events';

// An empty grid cell between the panels. It reports its box so the map fits inside it,
// and passes input through to the canvas underneath. It also reports the open screen the
// grid covers (ILI-1186): below the mission bar, right of the docked intel stream and above
// the bottom-right panels in landscape, above the dock on a phone.
export function MapArea() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const stream = document.querySelector('.slot-stream');
    const team = document.querySelector('.slot-team');
    const tabs = document.querySelector('.dock-tabs');
    const bar = document.querySelector('.slot-bar');
    const portrait = matchMedia('(max-aspect-ratio: 1/1)');
    const report = () => {
      const { x, y, width, height } = el.getBoundingClientRect();
      const coverLeft = stream && !portrait.matches ? stream.getBoundingClientRect().right : 0;
      const bottom = (portrait.matches ? tabs : team)?.getBoundingClientRect().top;
      const coverTop = bar?.getBoundingClientRect().bottom ?? 0;
      bus.emit(EV.mapRect, { x, y, width, height, coverLeft, coverTop, coverBottom: bottom || undefined });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    for (const other of [stream, team, tabs, bar]) if (other) ro.observe(other);
    portrait.addEventListener('change', report);
    report();
    return () => {
      ro.disconnect();
      portrait.removeEventListener('change', report);
    };
  }, []);
  return <div ref={ref} className="map-area" data-testid="map-area" />;
}
