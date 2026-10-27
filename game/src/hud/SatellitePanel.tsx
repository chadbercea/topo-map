import { game, useGame } from '../sim/store';
import { CAPTURE, describe, type CaptureMode } from '../sim/satellite';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// ORION-3's panel (ILI-1167), in the band under the map: on its way, on station (pick how
// to look), capturing, and what it saw. While it swings over, the panel says when it's
// there; the picture itself lands on the map.
export function SatellitePanel() {
  const sat = useGame((s) => s.satellite);
  const now = useGame((s) => s.elapsedMs);
  const playing = useGame((s) => s.minigame?.status === 'active');
  if (playing || (sat.state === 'idle' && !sat.result)) return null;
  const secs = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

  return (
    <section className="panel satellite" data-testid="satellite" data-state={sat.state} role="dialog" aria-label="ORION-3 satellite">
      <h2>ORION-3 · {sat.state === 'idle' ? sat.result!.square : sat.aim}</h2>
      {sat.state === 'slewing' && (
        <>
          <p className="instructions">Moving into position. On station in {secs(sat.arriveMs - now)}.</p>
          <span className="bar" role="progressbar" aria-label="Moving into position">
            <span style={{ width: `${Math.min(100, ((now - sat.startMs) / Math.max(1, sat.arriveMs - sat.startMs)) * 100)}%` }} />
          </span>
          <div className="actions">
            <button onClick={game.cancelLook}>Cancel</button>
          </div>
        </>
      )}
      {sat.state === 'onStation' && (
        <>
          <p className="instructions">On station. How do you want to look?</p>
          <div className="modes" data-testid="capture-modes">
            {MODES.map((m) => (
              <button key={m} onClick={() => game.capture(m)} data-testid={`capture-${m}`}>
                <b>
                  {CAPTURE[m].label}
                  {CAPTURE[m].ms ? ` · ${CAPTURE[m].ms / 1000}s` : ''}
                </b>
                <small>{CAPTURE[m].what}</small>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="quiet" onClick={game.cancelLook}>
              Cancel
            </button>
          </div>
        </>
      )}
      {sat.state === 'capturing' && (
        <>
          <p className="instructions">
            {sat.mode === 'video' ? 'Live video. Watch them move on the map.' : 'Burst in progress: three frames to show who is moving.'}
          </p>
          <span className="bar" role="timer" aria-label="Capture time left">
            <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
          </span>
          <p className="secs">{secs(sat.captureUntilMs - now)} left</p>
        </>
      )}
      {sat.state === 'idle' && sat.result && (
        <>
          <p className="result" data-testid="satellite-result">
            {CAPTURE[sat.result.mode].label}: {describe(sat.result)}. Downlinked to ALPHA.
          </p>
          <div className="actions">
            <button onClick={game.closeLook}>Close</button>
          </div>
        </>
      )}
    </section>
  );
}
