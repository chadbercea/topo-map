import { useEffect, useRef, useState } from 'react';
import { useGame } from '../sim/store';
import { gauge, GAUGE_MAX, LOW_AT } from '../sim/intel';

// ALPHA's intel gauge (ILI-1314, ILI-1341): what keeps the team moving, a bar, not a number.
// It shows the whole loop on the bar itself (ILI-1339):
// - intel landing: the bar fills and flashes as the analysts push it;
// - banked intel: a hollow segment past the fill, waiting for ALPHA to head into the square
//   HQ scanned ahead; it turns solid as it pays out;
// - ALPHA walking: the fill runs (stripes marching), draining as the team covers ground;
//   empty, the fill stops and ALPHA holds.
// The tick is a square from empty, where HQ is told to scan ahead.
const FLASH_MS = 700;

export function IntelGauge() {
  const intel = useGame((s) => Math.round(gauge(s)));
  const banked = useGame((s) => Math.round(s.intel.banked.reduce((n, b) => n + b.amount, 0)));
  const walking = useGame((s) => s.team.activity.startsWith('Moving'));
  const hollow = Math.min(banked, GAUGE_MAX - intel);

  // A flash each time intel lands: the gauge went up.
  const last = useRef(intel);
  const [fed, setFed] = useState(0);
  useEffect(() => {
    if (intel > last.current + 1) setFed((n) => n + 1);
    last.current = intel;
  }, [intel]);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!fed) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [fed]);

  return (
    <span
      className="intel-gauge"
      role="meter"
      aria-label="Intel"
      aria-valuemin={0}
      aria-valuemax={GAUGE_MAX}
      aria-valuenow={intel}
      data-testid="intel-gauge"
      data-low={intel < LOW_AT || undefined}
      data-empty={intel === 0 || undefined}
      data-walking={(walking && intel > 0) || undefined}
      data-fed={flashing || undefined}
      data-banked={hollow || undefined}
    >
      <i style={{ width: `${intel}%` }} />
      {hollow > 0 && <s style={{ left: `${intel}%`, width: `${hollow}%` }} data-testid="intel-banked" />}
      <b style={{ left: `${LOW_AT}%` }} />
    </span>
  );
}
