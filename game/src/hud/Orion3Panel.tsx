import { useGame } from '../sim/store';
import { CAPTURE, satelliteStatus } from '../sim/satellite';
import { gameSpan } from '../sim/gameTime';

// ORION-3, the imaging satellite (ILI-1195, ILI-1201): its own panel, always on screen in the
// bottom-right corner, for the satellite's own status: where it's pointed and what it's doing.
// The square HQ picks, and every option for looking at it, hang off the zoomed segment on the
// map (SatelliteInset).
export function Orion3Panel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const playing = s.minigame?.status === 'active';

  return (
    <section className="panel satellite" data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span>IMAGING SAT</span>
        <span className="status" data-testid="satellite-status">
          {satelliteStatus(s)}
        </span>
      </h2>
      {playing ? (
        <p className="instructions">Tied up while the strike runs on the map.</p>
      ) : sat.state === 'slewing' ? (
        <>
          <p className="instructions">
            Moving to {sat.aim}. On station in {gameSpan(sat.arriveMs - now)}.
          </p>
          <span className="bar" role="progressbar" aria-label="ORION-3 moving">
            <span style={{ width: `${Math.min(100, ((now - sat.startMs) / Math.max(1, sat.arriveMs - sat.startMs)) * 100)}%` }} />
          </span>
        </>
      ) : sat.state === 'onStation' ? (
        <p className="instructions">On station over {sat.aim}. Pick how to look beside the zoomed view.</p>
      ) : sat.state === 'capturing' ? (
        <p className="instructions">
          {CAPTURE[sat.mode!].label} over {sat.aim} · {gameSpan(sat.captureUntilMs - now)} left
        </p>
      ) : (
        <p className="instructions idle">Tap a square on the map to zoom in and point ORION-3 at it.</p>
      )}
    </section>
  );
}
