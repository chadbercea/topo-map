import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, orionSquare, satelliteStatus, type CaptureMode } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { gameSpan, zulu } from '../sim/gameTime';
import { bus, EV } from '../game/events';
import { Actions, Card, hasActions } from './SquareCard';
import { useTier } from './tier';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// ORION-3, the imaging satellite (ILI-1219): the big panel down the right, where the whole scan
// happens. A square HQ picks on the map shows here, its details and Scan (ILI-1228; there's no
// floating card); Scan tasks ORION-3, and it repositions with a countdown that
// runs down to nothing, then, on station, the larger square opens up with the ways to look
// (photo, burst, video); a capture runs its time, and what it saw stays in the picture. The
// picture has a fixed place at the panel's top (ILI-1229): with no square to show it holds a
// placeholder, where the Three.js satellite goes (ILI-1196). A strike ties it up. Phaser
// draws the picture into the frame.
export function OrionPanel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const tied = s.minigame?.status === 'active';
  const square = orionSquare(s);
  const snap = square ? s.imagery[square] : undefined;
  const live = sat.state === 'onStation' || sat.state === 'capturing';

  const result = sat.state === 'idle' ? sat.result : null;
  const picked = lookSquare(s); // the square HQ is working
  const tier = useTier();
  const phone = tier === 'compact';
  // The larger square while ORION-3 is on it, or a picked square it has imagery of; else the
  // placeholder (ILI-1229).
  const showPicture = !tied && (live || (sat.state === 'idle' && !!picked && !!snap));
  const caption = tied
    ? 'Tied up by the strike'
    : sat.state === 'slewing'
      ? `On its way to ${sat.aim}`
      : picked
        ? `No imagery of ${picked} · Scan`
        : `Over ${sat.aim} · tap a square to task it`;
  const last = Object.values(s.imagery)
    .filter((x) => x.mode !== 'eyes')
    .sort((a, b) => b.atMs - a.atMs)[0];

  // The picture frame: Phaser's inset camera draws ORION-3's view of the square into it.
  const picRef = useRef<HTMLDivElement>(null);
  const sent = useRef('');
  useLayoutEffect(() => {
    const r = picRef.current?.getBoundingClientRect();
    // Only while the frame is wholly in the panel's view: Phaser draws over the page, so a frame
    // scrolled part out of the panel would paint over whatever is beside it.
    const view = picRef.current?.closest('.orion')?.getBoundingClientRect();
    const whole = !!r && !!view && r.top >= view.top - 1 && r.bottom <= view.bottom + 1;
    const frame = r && r.width && r.height && whole ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);
  const [, redraw] = useState(0);
  // A new stage of the scan, or a new square, starts at the top of the panel: on a phone's small
  // sheet a scroll left over from tapping a capture would hide what comes next.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [sat.state, picked]);

  const head = tied ? 'tied up' : sat.state === 'idle' ? `over ${sat.aim}` : sat.state === 'slewing' ? `→ ${sat.aim}` : `${sat.aim} · ${sat.state === 'onStation' ? 'on station' : CAPTURE[sat.mode!].label.toLowerCase()}`;
  const travel = Math.max(1, sat.arriveMs - sat.startMs);
  const left = Math.max(0, sat.arriveMs - now);

  return (
    <section ref={panelRef} className="panel orion" onScroll={() => redraw((n) => n + 1)} data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span>ORION-3</span>
        <span className="where">{head}</span>
      </h2>
      <p className="sr-only" data-testid="satellite-status">
        {tied ? 'ORION-3 · tied up' : satelliteStatus(s)}
      </p>

      {/* The image area: always here, always the same size (ILI-1229). */}
      <div className="o-frame">
        {showPicture ? (
          <div ref={picRef} className="o-picture" data-testid="satellite-inset" data-state={live ? sat.state : 'imaged'} aria-label={`ORION-3's picture of ${square}`} />
        ) : (
          <div className="o-placeholder" data-testid="orion-placeholder" data-state={tied ? 'tied' : sat.state}>
            <SatelliteMark />
            <span className="o-caption">{caption}</span>
          </div>
        )}
      </div>

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

      {picked && !tied && phone && hasActions(s, picked) && (
        // On a phone what HQ can do about the square is here too, first, where the sheet shows it (ILI-1228).
        <section className="action-panel in-sheet" data-testid="action-panel" data-square={picked} aria-label={`Act on ${picked}`}>
          <Actions s={s} square={picked} />
        </section>
      )}
      {picked && !tied && (
        <section className="square-card o-square" data-testid="square-card" data-square={picked} role="group" aria-label={`Square ${picked}`}>
          <Card s={s} square={picked} />
        </section>
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
          <dd>{last ? `${last.square} · ${last.mode} ${zulu(last.atMs)} · ${freshness(last, now)}` : 'none yet'}</dd>
        </dl>
      )}
    </section>
  );
}

// Where the Three.js satellite goes (ILI-1196): for now a still mark, ORION-3 in outline.
function SatelliteMark() {
  return (
    <svg className="o-sat" viewBox="0 0 120 60" aria-hidden>
      <rect x="4" y="22" width="34" height="16" />
      <line x1="15" y1="22" x2="15" y2="38" />
      <line x1="26" y1="22" x2="26" y2="38" />
      <line x1="38" y1="30" x2="48" y2="30" />
      <rect x="48" y="20" width="24" height="20" />
      <line x1="72" y1="30" x2="82" y2="30" />
      <rect x="82" y="22" width="34" height="16" />
      <line x1="94" y1="22" x2="94" y2="38" />
      <line x1="105" y1="22" x2="105" y2="38" />
      <path d="M54 40 L60 50 L66 40" />
    </svg>
  );
}
