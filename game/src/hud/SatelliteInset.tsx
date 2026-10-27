import { useEffect, useState } from 'react';
import { bus, EV, getMapRect, insetRect, type MapRect } from '../game/events';
import { useGame } from '../sim/store';

// The frame and caption around ORION-3's inset (ILI-1179). Phaser draws the satellite's view
// inside it with a second camera; the tactical map behind it doesn't move.
export function SatelliteInset() {
  const state = useGame((s) => (s.minigame ? null : s.satellite.state));
  const aim = useGame((s) => s.satellite.aim);
  const [rect, setRect] = useState<MapRect | null>(getMapRect);
  useEffect(() => {
    setRect(getMapRect()); // the map may have reported before this subscribed
    bus.on(EV.mapRect, setRect);
    return () => void bus.off(EV.mapRect, setRect);
  }, []);
  if (!rect || (state !== 'onStation' && state !== 'capturing')) return null;
  const box = insetRect(rect);
  return (
    <div className="sat-inset" data-testid="satellite-inset" data-state={state} style={{ left: box.x, top: box.y, width: box.size, height: box.size }}>
      <span className="caption">
        ORION-3 · {aim} · {state === 'capturing' ? 'CAPTURING' : 'ON STATION'}
      </span>
    </div>
  );
}
