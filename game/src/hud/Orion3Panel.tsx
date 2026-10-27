import { game, useGame } from '../sim/store';
import { CAPTURE, describe, satelliteBusy, satelliteStatus, slewMs, type CaptureMode } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { gameSpan } from '../sim/gameTime';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// ORION-3, the imaging satellite (ILI-1195): its own panel, always on screen at the foot of
// the intel column. Everything about imagery lives here and on the map, nothing in satcom:
// where it's pointed and what it's doing, the square HQ picked on the map with a Look button,
// the capture choices on station, and what it last saw. The picture itself lands on the map.
export function Orion3Panel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const playing = s.minigame?.status === 'active';
  const selected = s.map.selected;
  const busy = satelliteBusy(s);
  const snap = selected ? s.imagery[selected] : undefined;
  const seen = snap ? freshness(snap, now) : null;

  return (
    <section className="panel satellite" data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span>IMAGING SAT</span>
        <span className="status" data-testid="satellite-status">
          {satelliteStatus(s)}
        </span>
      </h2>

      {playing && <p className="instructions">Tied up while the strike runs on the map.</p>}

      {!playing && selected && sat.state !== 'onStation' && sat.state !== 'capturing' && (
        <div className="target square-actions" data-testid="square-actions">
          <span className="sq">{selected}</span>
          <span className="note">{seen ? `imagery ${seen}` : 'no imagery'}</span>
          <button disabled={busy} onClick={() => game.lookAt(selected)} data-testid="look-here">
            Look · {slewMs(s, selected) ? gameSpan(slewMs(s, selected)) : 'now'}
          </button>
        </div>
      )}

      {!playing && sat.state === 'slewing' && (
        <>
          <p className="instructions">
            Moving to {sat.aim}. On station in {gameSpan(sat.arriveMs - now)}.
          </p>
          <span className="bar" role="progressbar" aria-label="Moving into position">
            <span style={{ width: `${Math.min(100, ((now - sat.startMs) / Math.max(1, sat.arriveMs - sat.startMs)) * 100)}%` }} />
          </span>
          <div className="actions">
            <button onClick={game.cancelLook}>Cancel</button>
          </div>
        </>
      )}
      {!playing && sat.state === 'onStation' && (
        <>
          <p className="instructions">On station over {sat.aim}. How do you want to look?</p>
          <div className="modes" data-testid="capture-modes">
            {MODES.map((m) => (
              <button key={m} onClick={() => game.capture(m)} data-testid={`capture-${m}`}>
                <b>
                  {CAPTURE[m].label}
                  {CAPTURE[m].ms ? ` · ${gameSpan(CAPTURE[m].ms)}` : ''}
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
      {!playing && sat.state === 'capturing' && (
        <>
          <p className="instructions">
            {sat.mode === 'video' ? `Live video over ${sat.aim}. Watch them move on the map.` : `Burst over ${sat.aim}: three frames to show who is moving.`}
          </p>
          <span className="bar" role="timer" aria-label="Capture time left">
            <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
          </span>
          <p className="secs">{gameSpan(sat.captureUntilMs - now)} left</p>
        </>
      )}
      {!playing && sat.state === 'idle' && sat.result && !selected && (
        <>
          <p className="result" data-testid="satellite-result">
            {sat.result.square} · {CAPTURE[sat.result.mode].label}: {describe(sat.result)}. Downlinked to ALPHA.
          </p>
          <div className="actions">
            <button onClick={game.closeLook}>Close</button>
          </div>
        </>
      )}
      {!playing && sat.state === 'idle' && !sat.result && !selected && (
        <p className="instructions idle">Tap a square on the map to point ORION-3 at it.</p>
      )}
    </section>
  );
}
