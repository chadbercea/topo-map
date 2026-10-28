import { useEffect, useState } from 'react';
import { bus, EV } from '../game/events';

// After HQ pans the map by hand (WASD or the arrow keys, ILI-1205) the camera stops
// following ALPHA; this brings it back, as F does.
export function Recentre() {
  const [panned, setPanned] = useState(false);
  useEffect(() => {
    bus.on(EV.panned, setPanned);
    return () => void bus.off(EV.panned, setPanned);
  }, []);
  if (!panned) return null;
  return (
    <button className="panel recentre" onClick={() => bus.emit(EV.recentre)} data-testid="recentre" title="Back to ALPHA, and follow it (F)">
      ◎ ALPHA <kbd>F</kbd>
    </button>
  );
}
