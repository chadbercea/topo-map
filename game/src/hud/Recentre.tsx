import { useEffect, useState } from 'react';
import { bus, EV } from '../game/events';

// The camera stays centred on ALPHA (ILI-1227). After HQ pans the map by hand (WASD, the arrow
// keys, a drag or a pinch) it stays where HQ put it, and this button brings it back, as F does.
// Over the map's bottom-right corner (ILI-1396: the team panel it sat on is a drawer now).
export function Recentre() {
  const [panned, setPanned] = useState(false);
  useEffect(() => {
    bus.on(EV.panned, setPanned);
    return () => void bus.off(EV.panned, setPanned);
  }, []);
  if (!panned) return null;
  return (
    <button className="recentre" data-overlay="recentre" onClick={() => bus.emit(EV.recentre)} data-testid="recentre" title="Back to ALPHA, and follow it (F)">
      ◎ ALPHA <kbd>F</kbd>
    </button>
  );
}
