import { useEffect, useState } from 'react';
import { bus, EV } from '../game/events';

// The map control (ILI-1470), in the map's bottom-right corner: once HQ has panned away by hand
// (WASD, the arrow keys or a drag), back to ALPHA, as F does: the camera stays centred on ALPHA
// until then (ILI-1227). The zoom is fixed (ILI-1484): no zoom buttons.
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
    </div>
  );
}
