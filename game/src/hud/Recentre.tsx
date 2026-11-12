import { useEffect, useState } from 'react';
import { bus, EV } from '../game/events';

// The map controls (ILI-1470), in the map's bottom-right corner: zoom in and out, and, once HQ has
// panned away by hand (WASD, the arrow keys, a drag or a pinch), back to ALPHA, as F does: the
// camera stays centred on ALPHA until then (ILI-1227).
export function Recentre() {
  const [panned, setPanned] = useState(false);
  useEffect(() => {
    bus.on(EV.panned, setPanned);
    return () => void bus.off(EV.panned, setPanned);
  }, []);
  return (
    <div className="map-ctl" data-overlay="recentre">
      {panned && (
        <button className="recentre" onClick={() => bus.emit(EV.recentre)} data-testid="recentre" title="Back to ALPHA, and follow it (F)">
          ◎ ALPHA <kbd>F</kbd>
        </button>
      )}
      <button className="map-zoom" onClick={() => bus.emit(EV.zoom, 1.25)} data-testid="zoom-in" aria-label="Zoom in" title="Zoom in">
        +
      </button>
      <button className="map-zoom" onClick={() => bus.emit(EV.zoom, 0.8)} data-testid="zoom-out" aria-label="Zoom out" title="Zoom out">
        −
      </button>
    </div>
  );
}
