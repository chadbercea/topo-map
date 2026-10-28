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
import { IncomingAlert, useAskHidden } from './IntelStream';
import { useTier } from './tier';
import type { GameState } from '../sim/state';

const MODES: CaptureMode[] = ['photo', 'burst', 'video'];
const WIDTH = 340;
const PICTURE = 272; // the larger square: one square tall, CSS px (ILI-1206: twice the first cut)
const THUMB = 160; // on a phone, beside the facts
const ACTIONS = 300; // the action panel's width

// The square card (ILI-1203): the one place HQ works a square from. Tap a square on the map,
// or open an event in the intel stream, and a card pins beside it: what HQ knows of the
// ground, the weather over it, its imagery and what's been found there, and Scan. ORION-3
// swings over (the countdown is in the header); on station the card opens up to the larger
// square, the satellite's picture of it, with how to look underneath. The card is recon only
// (ILI-1211): what HQ can do about the square (a strike on each contact, ALPHA's attack,
// listening to or jamming a signal, a resupply drop) is its own action panel, docked beside
// the card, shown only when there's something to act on. One card at a time; tapping another
// square moves it, tapping the same square or × clears both. On a phone the card docks at the
// top of the map and the action panel over the dock tabs; on a fold or tablet both take over
// the side rail, the card on top (ILI-1213).
export function SquareCard() {
  const s = useGame((x) => x);
  const square = lookSquare(s);
  const cardRef = useRef<HTMLElement>(null);
  const actRef = useRef<HTMLElement>(null);
  const picRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [actHeight, setActHeight] = useState(0);
  const askHidden = useAskHidden(); // docked, the action panel covers the stream, and its raised ask with it
  const tier = useTier();
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
    const act = actRef.current;
    if (act && act.offsetHeight !== actHeight) setActHeight(act.offsetHeight);
    const pic = picRef.current?.getBoundingClientRect();
    const frame = pic ? { x: Math.round(pic.x), y: Math.round(pic.y), width: Math.round(pic.width), height: Math.round(pic.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);

  const area = getMapRect();
  if (!square || !area) return null;
  const acting = hasActions(s, square);
  const rail = tier === 'medium' ? railRect() : null;
  let at: Placed;
  let side: Docked | null = null;
  let pic: { width?: number; height: number };
  if (rail) {
    // The rail: the card on top, the actions under it; the card gives up room to them.
    const room = acting ? rail.height - Math.min(actHeight || 200, rail.height / 2) - 8 : rail.height;
    at = { left: rail.x, top: rail.y, width: rail.width, maxHeight: room, side: 'rail' };
    const below = rail.y + Math.min(height, room) + 8;
    if (acting) side = { left: rail.x, top: below, bottom: undefined, width: rail.width, maxHeight: rail.y + rail.height - below, side: 'rail' };
    pic = { height: Math.min(PICTURE, Math.round(rail.height * 0.42)) };
  } else if (tier === 'compact') {
    at = docked(area);
    if (acting) side = footed(at.top + height);
    pic = { width: THUMB, height: THUMB };
  } else {
    at = beside(square, area, height, s.team.position);
    if (acting) side = alongside(at, area, height, actHeight, squareRect(square));
    pic = { height: PICTURE };
  }
  return (
    <>
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
        <Card s={s} square={square} picRef={picRef} pic={pic} />
      </section>
      {side && (
        <section
          ref={actRef}
          className="action-panel"
          data-testid="action-panel"
          data-square={square}
          data-side={side.side}
          style={{ left: side.left, top: side.top, bottom: side.bottom, width: side.width, maxHeight: side.maxHeight }}
          aria-label={`Act on ${square}`}
        >
          {tier !== 'wide' && askHidden && <IncomingAlert as="div" testId="answer-alpha-panel" />}
          <Actions s={s} square={square} />
        </section>
      )}
    </>
  );
}

type Area = NonNullable<ReturnType<typeof getMapRect>>;
type Placed = { left: number; top: number; width: number; maxHeight: number; side: string };
type Docked = { left: number; top?: number; bottom?: number; width: number; maxHeight: number; side: string };

// The action panel docks to the card on its far side from the square when there's room;
// else on the square's other side, so card and panel bracket it; else under the card. It
// never covers the square or runs off the open map; a tall one scrolls.
function alongside(card: Placed, area: Area, cardHeight: number, height: number, sq: { x0: number; x1: number } | null) {
  const gap = 8;
  const top = Math.max(area.y + 8, Math.min(card.top, area.y + area.height - 8 - height));
  const maxHeight = area.y + area.height - 8 - top;
  const fits = (x: number) => x >= area.x + 8 && x + ACTIONS <= area.x + area.width - 8;
  const cardRight = card.side !== 'left'; // the card sits right of the square
  const far = cardRight ? card.left + card.width + gap : card.left - gap - ACTIONS;
  const across = sq && (cardRight ? sq.x0 - 10 - ACTIONS : sq.x1 + 10);
  const x = fits(far) ? far : across !== null && fits(across) ? across : null;
  if (x !== null) return { left: x, top, bottom: undefined, width: ACTIONS, maxHeight, side: x === far ? 'far' : 'across' };
  const below = card.top + cardHeight + gap;
  return { left: card.left, top: below, bottom: undefined, width: card.width, maxHeight: Math.max(120, area.y + area.height - 8 - below), side: 'below' };
}

// The square's left and right edges on screen.
function squareRect(square: string) {
  const sq = parseSquare(square)!;
  const tl = toScreen(sq.col * CELL, sq.row * CELL);
  const br = toScreen((sq.col + 1) * CELL, (sq.row + 1) * CELL);
  return tl && br ? { x0: tl.x, x1: br.x } : null;
}

// A phone: over the dock at the foot of the screen, the card keeping the top of the map;
// never up over the card.
function footed(cardBottom: number) {
  const maxHeight = Math.round(Math.min(innerHeight * 0.5, innerHeight - 8 - (cardBottom + 8)));
  return { left: 8, top: undefined, bottom: 8, width: innerWidth - 16, maxHeight, side: 'foot' };
}

// Anything in this square HQ can act on: an unresolved event, or ALPHA standing here.
export function hasActions(s: GameState, square: string) {
  return s.events.some((e) => e.square === square && e.status !== 'resolved') || squareAt(s.team.position.x, s.team.position.y) === square;
}

// Beside the square, on the side away from ALPHA when both have room (so ALPHA's flag stays
// clear), top level with it, kept inside the open map.
function beside(square: string, area: Area, height: number, team: { x: number; y: number }): Placed {
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

// A fold or tablet (ILI-1213): the side rail, from its tabs to the foot of the screen.
function railRect() {
  const tabs = document.querySelector('.dock-tabs')?.getBoundingClientRect();
  const hud = document.querySelector('.hud');
  if (!tabs || !hud) return null;
  const foot = hud.getBoundingClientRect().bottom - parseFloat(getComputedStyle(hud).paddingBottom);
  return { x: tabs.x, y: tabs.y, width: tabs.width, height: foot - tabs.y };
}

// A phone: across the top of the open map (the camera keeps ALPHA low and centred).
function docked(area: Area): Placed {
  return { left: area.x + 8, top: area.y + 8, width: area.width - 16, maxHeight: Math.round(area.height * 0.85), side: 'dock' };
}

function Card({ s, square, picRef, pic }: { s: GameState; square: string; picRef: React.RefObject<HTMLDivElement | null>; pic: { width?: number; height: number } }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const working = sat.aim === square && sat.state !== 'idle'; // ORION-3 is on this square
  const result = sat.state === 'idle' && sat.result?.square === square ? sat.result : null;
  const g = ground(s, square)!;
  const wx = weather(s);
  const snap = s.imagery[square];
  const seen = snap ? freshness(snap, now) : null;
  const found = s.contacts.filter((c) => c.square === square && c.status === 'revealed');
  const showPicture = working ? sat.state === 'onStation' || sat.state === 'capturing' : !!snap;
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
        {!working && snap && (
          // Already imaged: the picture's the point, so a look again is a small header button.
          <button className="rescan" disabled={satelliteBusy(s)} onClick={() => game.lookAt(square)} data-testid="look-here">
            Rescan · {slewMs(s, square) ? gameSpan(slewMs(s, square)) : 'now'}
          </button>
        )}
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
            style={pic}
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
            {result && ( // what this look saw
              <span className="result" data-testid="satellite-result">
                {' '}
                · {CAPTURE[result.mode].label}: {describe(result)}
              </span>
            )}
          </dd>
        </dl>
      </div>

      {/* ORION-3 */}
      {!working && !snap && (
        <div className="sc-row square-actions" data-testid="square-actions">
          <button disabled={satelliteBusy(s)} onClick={() => game.lookAt(square)} data-testid="look-here">
            Scan · {slewMs(s, square) ? gameSpan(slewMs(s, square)) : 'now'}
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

// What HQ can do about the square (ILI-1211): one block per thing going on there, with its
// options, and a resupply drop when ALPHA is here.
function Actions({ s, square }: { s: GameState; square: string }) {
  const now = s.elapsedMs;
  const events = s.events.filter((e) => e.square === square && e.status !== 'resolved');
  const alphaHere = squareAt(s.team.position.x, s.team.position.y) === square;
  return (
    <>
      <header className="ap-head">
        Act on <b>{square}</b>
      </header>
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
