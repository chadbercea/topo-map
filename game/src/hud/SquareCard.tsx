import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus, EV, getMapRect, toScreen } from '../game/events';
import { CELL, parseSquare, squareAt } from '../map/grid';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, satelliteBusy, slewMs, type CaptureMode } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { ground, weather } from '../sim/conditions';
import { gameSpan, zulu } from '../sim/gameTime';
import { RESUPPLY_COST } from '../sim/support';
import { EVENT_LABEL } from '../sim/stream';
import { TargetMenu } from './TargetMenu';
import type { GameState } from '../sim/state';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];
const WIDTH = 300;
const PICTURE = 170; // the larger square's picture height, CSS px (a 96 px thumbnail on a phone)

// The square card (ILI-1203): the one place HQ works a square from. Tap a square on the map,
// or open an event in the intel stream, and a card pins beside it: what HQ knows of the
// ground, the weather over it, its imagery and what's been found there, and Scan. ORION-3
// swings over (the countdown is in the header); on station the card opens up to the larger
// square, the satellite's picture of it, with how to look underneath. Once something is
// found there, the card is where HQ calls it in: a strike on each contact, ALPHA's attack,
// listening to or jamming a signal, a resupply drop to ALPHA. One card at a time; tapping
// another square moves it, tapping the same square or × clears it. On a phone it docks at
// the foot of the map.
export function SquareCard() {
  const s = useGame((x) => x);
  const square = lookSquare(s);
  const cardRef = useRef<HTMLElement>(null);
  const picRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const sent = useRef('');
  const [, redraw] = useState(0);
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    bus.on(EV.camera, again);
    bus.on(EV.mapRect, again);
    return () => {
      bus.off(EV.camera, again);
      bus.off(EV.mapRect, again);
    };
  }, []);
  // Phaser draws ORION-3's picture of the square into the card's picture frame.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el && el.offsetHeight !== height) setHeight(el.offsetHeight);
    const pic = picRef.current?.getBoundingClientRect();
    const frame = pic ? { x: Math.round(pic.x), y: Math.round(pic.y), width: Math.round(pic.width), height: Math.round(pic.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);

  const area = getMapRect();
  if (!square || !area) return null;
  const phone = matchMedia('(max-aspect-ratio: 1/1)').matches;
  const at = phone ? docked(area) : beside(square, area, height, s.team.position);
  return (
    <section
      ref={cardRef}
      className="square-card"
      data-testid="square-card"
      data-square={square}
      data-side={at.side}
      style={{ left: at.left, top: at.top, width: at.width, maxHeight: at.maxHeight }}
      role="dialog"
      aria-label={`Square ${square}`}
    >
      <Card s={s} square={square} picRef={picRef} phone={phone} />
    </section>
  );
}

// Beside the square, on the side away from ALPHA when both have room (so ALPHA's flag stays
// clear), top level with it, kept inside the open map.
function beside(square: string, area: NonNullable<ReturnType<typeof getMapRect>>, height: number, team: { x: number; y: number }) {
  const sq = parseSquare(square)!;
  const tl = toScreen(sq.col * CELL, sq.row * CELL);
  const br = toScreen((sq.col + 1) * CELL, (sq.row + 1) * CELL);
  const alpha = toScreen(team.x, team.y);
  const maxHeight = area.height - 16;
  if (!tl || !br) return { left: area.x + 8, top: area.y + 8, width: WIDTH, maxHeight, side: 'right' };
  const roomRight = br.x + 10 + WIDTH <= area.x + area.width - 8;
  const roomLeft = tl.x - 10 - WIDTH >= area.x + 8;
  const alphaRight = !!alpha && alpha.x > (tl.x + br.x) / 2;
  const right = roomRight && !(alphaRight && roomLeft);
  const left = right ? br.x + 10 : Math.max(area.x + 8, tl.x - 10 - WIDTH);
  const top = Math.max(area.y + 8, Math.min(tl.y, area.y + area.height - 8 - height));
  return { left, top, width: WIDTH, maxHeight, side: right ? 'right' : 'left' };
}

// A phone: across the top of the open map (the camera keeps ALPHA low and centred).
function docked(area: NonNullable<ReturnType<typeof getMapRect>>) {
  return { left: area.x + 8, top: area.y + 8, width: area.width - 16, maxHeight: Math.round(area.height * 0.85), side: 'dock' };
}

function Card({ s, square, picRef, phone }: { s: GameState; square: string; picRef: React.RefObject<HTMLDivElement | null>; phone: boolean }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const working = sat.aim === square && sat.state !== 'idle'; // ORION-3 is on this square
  const result = sat.state === 'idle' && sat.result?.square === square ? sat.result : null;
  const g = ground(s, square)!;
  const wx = weather(s);
  const snap = s.imagery[square];
  const seen = snap ? freshness(snap, now) : null;
  const events = s.events.filter((e) => e.square === square && e.status !== 'resolved');
  const found = s.contacts.filter((c) => c.square === square && c.status === 'revealed');
  const showPicture = working ? sat.state === 'onStation' || sat.state === 'capturing' : !!snap;
  const alphaHere = squareAt(s.team.position.x, s.team.position.y) === square;
  const status = working
    ? sat.state === 'slewing'
      ? `ORION-3 ${gameSpan(sat.arriveMs - now)} away`
      : sat.state === 'onStation'
        ? 'ORION-3 on station'
        : `ORION-3 ${CAPTURE[sat.mode!].label.toLowerCase()} · ${gameSpan(sat.captureUntilMs - now)}`
    : snap
      ? `imaged ${zulu(snap.atMs)} · ${seen}`
      : 'no imagery';
  const close = () => {
    if (sat.state === 'slewing' && sat.aim === square) game.cancelLook();
    game.closeSquare();
  };

  return (
    <>
      <header className="sc-head" data-state={working ? sat.state : result ? 'result' : 'selected'}>
        <b>{square}</b>
        <span className="sc-status" data-testid="square-status">
          {status}
        </span>
        <button className="x" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sc-body">
        {showPicture && (
          <div
            ref={picRef}
            className="sc-picture"
            data-testid="satellite-inset"
            data-state={working ? sat.state : 'imaged'}
            style={phone ? { width: 96, height: 96 } : { height: PICTURE }}
            aria-label={`ORION-3's picture of ${square}`}
          />
        )}
        <dl className="facts" data-testid="square-facts">
          <dt>Ground</dt>
          <dd>
            {g.lowM}–{g.highM} m · {g.slope}
            {g.features.length ? ` · ${g.features.join(', ')}` : ''}
          </dd>
          <dt>Weather</dt>
          <dd>
            {wx.sky.toLowerCase()} · vis {wx.visibilityKm} km · {wx.light.toLowerCase()}
          </dd>
          <dt>Imagery</dt>
          <dd>{snap ? `${snap.mode === 'eyes' ? 'eyes on' : snap.mode} ${zulu(snap.atMs)} · ${seen}` : g.imagery}</dd>
          <dt>Found</dt>
          <dd>
            {found.length ? found.map((c) => c.label).join(', ') : snap ? 'nothing seen' : 'not looked at yet'}
            {result && (
              <span className="result" data-testid="satellite-result">
                {' '}
                · {CAPTURE[result.mode].label}: {describe(result)}
              </span>
            )}
          </dd>
        </dl>
      </div>

      {/* What's going on in this square, and what HQ can call in on it. */}
      {events.map((e) => (
        <div key={e.id} className="sc-event event-card" data-kind={e.kind} data-testid="event-card">
          <h3>
            {EVENT_LABEL[e.kind]} · {e.square}
          </h3>
          <p className="title">{e.title}</p>
          {e.kind === 'contact' && e.id.startsWith('contact-') ? (
            <TargetMenu contactId={e.id.slice('contact-'.length)} />
          ) : e.kind === 'signal' ? (
            <div className="signal-options">
              <button className="intercept" onClick={() => game.intercept(e.id)}>
                Listen
              </button>
              <button className="jam" onClick={() => game.jam(e.id)} title="Slows the enemy, but you won't learn what they're planning">
                Jam
              </button>
            </div>
          ) : e.kind === 'site' ? (
            <p className="note">ALPHA can search it for documents when it gets there.</p>
          ) : (
            <Call s={s} eventId={e.id} />
          )}
        </div>
      ))}
      {alphaHere && (
        <div className="sc-row support" data-testid="support">
          <button onClick={game.sendResupply} disabled={s.resources.budget < RESUPPLY_COST || s.inbound.length > 0} data-testid="send-resupply">
            Resupply drop · ${RESUPPLY_COST.toLocaleString()}
          </button>
          {s.inbound.length > 0 && <span className="secs">bird inbound · {gameSpan(s.inbound[0].arrivesMs - now)}</span>}
        </div>
      )}
      {/* ORION-3 */}
      {!working && (
        <div className="sc-row square-actions" data-testid="square-actions">
          <button disabled={satelliteBusy(s)} onClick={() => game.lookAt(square)} data-testid="look-here">
            {snap ? 'Scan again' : 'Scan'} · {slewMs(s, square) ? gameSpan(slewMs(s, square)) : 'now'}
          </button>
        </div>
      )}
      {working && sat.state === 'slewing' && (
        <div className="sc-row">
          <span className="bar" role="progressbar" aria-label="ORION-3 moving into position">
            <span style={{ width: `${Math.min(100, ((now - sat.startMs) / Math.max(1, sat.arriveMs - sat.startMs)) * 100)}%` }} />
          </span>
          <button className="quiet" onClick={game.cancelLook}>
            Cancel
          </button>
        </div>
      )}
      {working && sat.state === 'onStation' && (
        <div className="sc-row">
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
      {working && sat.state === 'capturing' && (
        <div className="sc-row">
          <span className="bar" role="timer" aria-label="Capture time left">
            <span style={{ width: `${((sat.captureUntilMs - now) / CAPTURE[sat.mode!].ms) * 100}%` }} />
          </span>
          <span className="secs">{sat.mode === 'video' ? 'live: watch them move' : 'three frames'}</span>
        </div>
      )}

    </>
  );
}

function Call({ s, eventId }: { s: GameState; eventId: string }) {
  const call = s.comms.messages.find((m) => m.eventId === eventId);
  if (!call) return <p className="note">Decision point. Responses arrive with comms and mini games.</p>;
  return (
    <p className="note">
      {call.from}: “{call.text}” {call.status === 'new' && call.holds ? 'Answer at ALPHA’s flag.' : ''}
    </p>
  );
}
