import { useLayoutEffect, useRef } from 'react';
import { bus, EV } from '../game/events';

// An empty grid cell between the panels. It reports its box so the map fits inside it,
// and passes input through to the canvas underneath.
export function MapArea() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const report = () => {
      const { x, y, width, height } = el.getBoundingClientRect();
      bus.emit(EV.mapRect, { x, y, width, height });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="map-area" data-testid="map-area" />;
}
