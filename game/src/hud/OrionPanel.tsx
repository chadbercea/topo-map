import { useEffect, useLayoutEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, orionSquare, satelliteStatus, type CaptureMode } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { gameSpan, zulu } from '../sim/gameTime';
import { bus, EV } from '../game/events';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// ORION-3, the imaging satellite (ILI-1219): the big panel down the right, where the whole scan
// happens. HQ tasks it from a square's card (Scan); here it repositions with a countdown that
// runs down to nothing, then, on station, the larger square opens up with the ways to look
// (photo, burst, video); a capture runs its time, and what it saw stays in the picture. Idle,
// it shows its last look. A strike ties it up. Phaser draws the picture into the frame.
export function OrionPanel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const tied = s.minigame?.status === 'active';
  const square = orionSquare(s);
  const snap = square ? s.imagery[square] : undefined;
  const live = sat.state === 'onStation' || sat.state === 'capturing';
  const showPicture = !tied && (live || (sat.state === 'idle' && !!snap));
  const result = sat.state === 'idle' ? sat.result : null;

  // The picture frame: Phaser's inset camera draws ORION-3's view of the square into it.
  const picRef = useRef<HTMLDivElement>(null);
  const sent = useRef('');
  useLayoutEffect(() => {
    const r = picRef.current?.getBoundingClientRect();
    const frame = r && r.width && r.height ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);

  const head = tied ? 'tied up' : sat.state === 'idle' ? `over ${sat.aim}` : sat.state === 'slewing' ? `→ ${sat.aim}` : `${sat.aim} · ${sat.state === 'onStation' ? 'on station' : CAPTURE[sat.mode!].label.toLowerCase()}`;
  const travel = Math.max(1, sat.arriveMs - sat.startMs);
  const left = Math.max(0, sat.arriveMs - now);

  return (
    <section className="panel orion" data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span>ORION-3</span>
        <span className="where">{head}</span>
      </h2>
      <p className="sr-only" data-testid="satellite-status">
        {tied ? 'ORION-3 · tied up' : satelliteStatus(s)}
      </p>

      {tied && <p className="o-note">Tied up by the strike. Back when it's done.</p>}

      {!tied && sat.state === 'slewing' && (
        // Repositioning: the countdown decays to nothing, then the options appear.
        <div className="o-move" data-testid="orion-repositioning">
          <span className="decay" role="progressbar" aria-label="ORION-3 repositioning" aria-valuenow={Math.round((left / travel) * 100)}>
            <span style={{ width: `${(left / travel) * 100}%` }} />
          </span>
          <p className="o-line">
            Repositioning to {sat.aim} · <b>{gameSpan(left)}</b>
          </p>
          <button className="quiet" onClick={game.cancelLook}>
            Cancel
          </button>
        </div>
      )}

      {showPicture ? (
        <div ref={picRef} className="o-picture" data-testid="satellite-inset" data-state={live ? sat.state : 'imaged'} aria-label={`ORION-3's picture of ${square}`} />
      ) : (
        !tied && sat.state !== 'slewing' && <div className="o-picture o-empty">No look yet. Tap a square, then Scan.</div>
      )}

      {!tied && sat.state === 'onStation' && (
        <div className="o-row">
          <div className="modes" data-testid="capture-modes">
            {MODES.map((m) => (
              <button key={m} onClick={() => game.capture(m)} data-testid={`capture-${m}`} title={CAPTURE[m].what}>
                {CAPTURE[m].label}
                <small>{CAPTURE[m].ms ? gameSpan(CAPTURE[m].ms) : 'instant'}</small>
              </button>
            ))}
          </div>
          <button className="quiet" onClick={game.cancelLook}>
            Cancel
          </button>
        </div>
      )}

      {!tied && sat.state === 'capturing' && (
        <div className="o-row">
          <span className="bar" role="timer" aria-label="Capture time left">
            <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
          </span>
          <span className="o-line">
            {CAPTURE[sat.mode!].label} · {gameSpan(sat.captureUntilMs - now)} · {sat.mode === 'video' ? 'live: watch them move' : 'three frames'}
          </span>
        </div>
      )}

      {!tied && sat.state === 'idle' && (
        <dl className="o-facts">
          {result && (
            <>
              <dt>Saw</dt>
              <dd data-testid="satellite-result">
                {result.square} · {CAPTURE[result.mode].label}: {describe(result)}
              </dd>
            </>
          )}
          <dt>Last look</dt>
          <dd>{snap && square ? `${square} · ${snap.mode} ${zulu(snap.atMs)} · ${freshness(snap, now)}` : 'none yet'}</dd>
        </dl>
      )}
    </section>
  );
}
