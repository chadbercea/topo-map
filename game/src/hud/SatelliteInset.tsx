import { useEffect, useState } from 'react';
import { bus, EV, getInset, getMapRect, type InsetLayout, type MapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, satelliteBusy, satelliteStatus, slewMs, type CaptureMode } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { ground, weather } from '../sim/conditions';
import { gameSpan, zulu } from '../sim/gameTime';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];

// The zoomed segment (ILI-1179, ILI-1201): pick a square on the map and a zoomed view of it
// opens in a top corner of the map, away from the square and ALPHA (Phaser draws it with a second camera; the map behind doesn't
// move). Everything about that square hangs off it: what HQ knows of the ground, the
// weather over it, its imagery and what earlier looks found, and ORION-3's options: look,
// the swing over, how to look on station, the capture, and what it saw.
export function SatelliteInset() {
  const s = useGame((x) => x);
  const [layout, setLayout] = useState<InsetLayout | null>(getInset);
  useEffect(() => {
    setLayout(getInset()); // the scene may have placed it before this subscribed
    bus.on(EV.inset, setLayout);
    return () => void bus.off(EV.inset, setLayout);
  }, []);
  const square = lookSquare(s);
  if (!layout || !square) return null;
  const sat = s.satellite;
  const now = s.elapsedMs;
  const working = sat.aim === square && sat.state !== 'idle'; // ORION-3 is on this square
  const result = sat.state === 'idle' && sat.result?.square === square && !s.map.selected ? sat.result : null;
  const state = working ? sat.state : result ? 'result' : 'selected';
  const g = ground(s, square)!;
  const wx = weather(s);
  const snap = s.imagery[square];
  const seen = snap ? freshness(snap, now) : null;
  const found = s.contacts.filter((c) => c.square === square && c.status === 'revealed');
  const { view, card } = layout;
  const close = () => (s.map.selected ? game.selectSquare(null) : game.closeLook());
  const caption = { selected: 'SELECTED', result: 'IMAGED', slewing: 'ORION-3 MOVING', onStation: 'ON STATION', capturing: 'CAPTURING', idle: '' }[state];

  return (
    <>
      <div className="sat-inset" data-testid="satellite-inset" data-state={state} style={{ left: view.x, top: view.y, width: view.size, height: view.size }}>
        <span className="caption">
          {square} · {caption}
        </span>
      </div>
      <section
        className="look-card"
        data-testid="look-card"
        data-state={state}
        data-side={layout.side}
        style={{ left: card.x, top: card.y, width: card.width, maxHeight: card.maxHeight }}
        aria-label={`Square ${square}`}
      >
        <dl className="facts" data-testid="square-facts">
          <dt>Ground</dt>
          <dd>
            {g.lowM}–{g.highM} m · {g.slope}
            {g.features.length ? ` · ${g.features.join(', ')}` : ' · open ground'}
          </dd>
          <dt>Weather</dt>
          <dd>
            {wx.sky.toLowerCase()} · vis {wx.visibilityKm} km · {wx.light.toLowerCase()}
          </dd>
          <dt>Imagery</dt>
          <dd>{snap ? `${snap.mode === 'eyes' ? 'eyes on' : snap.mode} ${zulu(snap.atMs)} · ${seen}` : g.imagery}</dd>
          <dt>Found</dt>
          <dd>{found.length ? found.map((c) => c.label).join(', ') : snap ? 'nothing seen' : 'not looked at yet'}</dd>
        </dl>

        {state === 'selected' && (
          <div className="actions square-actions" data-testid="square-actions">
            <button disabled={satelliteBusy(s)} onClick={() => game.lookAt(square)} data-testid="look-here">
              Look · {slewMs(s, square) ? gameSpan(slewMs(s, square)) : 'now'}
            </button>
            <button className="quiet" onClick={close}>
              Close
            </button>
          </div>
        )}
        {state === 'slewing' && (
          <>
            <p className="instructions">ORION-3 on station in {gameSpan(sat.arriveMs - now)}.</p>
            <span className="bar" role="progressbar" aria-label="Moving into position">
              <span style={{ width: `${Math.min(100, ((now - sat.startMs) / Math.max(1, sat.arriveMs - sat.startMs)) * 100)}%` }} />
            </span>
            <div className="actions">
              <button onClick={game.cancelLook}>Cancel</button>
            </div>
          </>
        )}
        {state === 'onStation' && (
          <>
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
        {state === 'capturing' && (
          <>
            <p className="instructions">{sat.mode === 'video' ? 'Live video: watch them move on the map.' : 'Burst: three frames to show who is moving.'}</p>
            <span className="bar" role="timer" aria-label="Capture time left">
              <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
            </span>
            <p className="secs">{gameSpan(sat.captureUntilMs - now)} left</p>
          </>
        )}
        {result && (
          <>
            <p className="result" data-testid="satellite-result">
              {result.square} · {CAPTURE[result.mode].label}: {describe(result)}. Downlinked to ALPHA.
            </p>
            <div className="actions">
              <button onClick={close}>Close</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

// ORION-3's status (ILI-1202): it has no panel, just this tag in a top corner of the map, the
// one the zoomed view isn't using. Where it's pointed and what it's doing; tied up while a
// mini game runs.
export function SatelliteTag() {
  const status = useGame((s) => (s.minigame?.status === 'active' ? 'ORION-3 · tied up' : satelliteStatus(s)));
  const state = useGame((s) => s.satellite.state);
  const [rect, setRect] = useState<MapRect | null>(getMapRect);
  const [layout, setLayout] = useState<InsetLayout | null>(getInset);
  useEffect(() => {
    setRect(getMapRect());
    setLayout(getInset()); // the scene may have reported before this subscribed
    bus.on(EV.mapRect, setRect);
    bus.on(EV.inset, setLayout);
    return () => {
      bus.off(EV.mapRect, setRect);
      bus.off(EV.inset, setLayout);
    };
  }, []);
  if (!rect) return null;
  const left = layout?.side === 'right';
  const style = left ? { left: rect.x + 8, top: rect.y + 8 } : { right: innerWidth - (rect.x + rect.width - 8), top: rect.y + 8 };
  return (
    <div className="sat-tag" data-testid="satellite" data-state={state} style={style} aria-label="ORION-3 imaging satellite">
      <span data-testid="satellite-status">{status}</span>
    </div>
  );
}
