import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { CAPTURE, slewMs } from '../sim/satellite';
import { freshness, targets } from '../sim/imagery';
import { squareAt } from '../map/grid';
import { TargetMenu } from './TargetMenu';
import { SniperPanel } from './SniperPanel';
import { ground, weather } from '../sim/conditions';
import { countdown, gameSpan, zulu } from '../sim/gameTime';
import { EVENT_LABEL } from '../sim/stream';
import { useTier } from './tier';
import { alphaBox, obstacles, pick, squareBox } from './overlays';
import type { GameState } from '../sim/state';

const ANCHOR_W = 300; // the anchor's width beside its square

// The square's anchor (ILI-1278, ILI-1302): everything HQ can do to the square it picked, and
// everything known about it, pinned beside that square on the map, so it stays tied to its
// ground however many things are going on and wherever ORION-3 is looking. Get eyes on it
// (ORION-3 slews there), its fighters and every way to strike them, anything else going on
// there (a signal, a request), and the square's facts. ORION-3's own panel only shows where the
// satellite is looking. Beside the square on the side away from ALPHA and clear of the other
// panels; on a phone, a strip along the foot of the map.
export function SquareCard() {
  const s = useGame((x) => x);
  const square = s.minigame ? null : s.map.selected;
  const actRef = useRef<HTMLElement>(null);
  const [actHeight, setActHeight] = useState(0);
  const tier = useTier();
  const placedKey = useRef('');
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
  useLayoutEffect(() => {
    // Its natural height, not as clamped: where it goes sets how tall it may be, and measuring
    // the clamped height would chase its own tail. A height grows at once but only shrinks by
    // more than a line: where it sits can re-wrap it a few px shorter, and that shorter height
    // can pick the other spot, where it measures taller again (React #185).
    const act = actRef.current;
    if (act && settle(actHeight, act.scrollHeight) !== actHeight) setActHeight(act.scrollHeight);
    // Where it ended up, for anything that must stay clear of it.
    const r = (e: HTMLElement | null) => e && [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight].join();
    const placed = `${r(actRef.current)}`;
    if (placed !== placedKey.current) bus.emit(EV.overlays);
    placedKey.current = placed;
  });
  useEffect(() => () => void bus.emit(EV.overlays), []);

  const area = getMapRect();
  if (!square || !area) return null;
  const at: Placed = tier === 'compact' ? strip(area, actHeight) : beside(square, area, actHeight, s.team.position, ANCHOR_W);
  return (
    <section
      ref={actRef}
      className="square-card anchor"
      data-testid="square-card"
      data-overlay="actions"
      data-square={square}
      data-side={at.side}
      style={{ left: at.left, top: at.top, width: at.width, maxHeight: at.maxHeight }}
      role="group"
      aria-label={`Square ${square}`}
    >
      <Card s={s} square={square} />
    </section>
  );
}

// On a phone (ILI-1302): the width of the map, along its foot, at most half its height.
function strip(area: Area, height: number): Placed {
  const maxHeight = Math.round(area.height * 0.5);
  const h = Math.min(height || 200, maxHeight);
  return { left: area.x + 8, top: area.y + area.height - 8 - h, width: area.width - 16, maxHeight, side: 'foot' };
}

type Area = NonNullable<ReturnType<typeof getMapRect>>;

type Placed = { left: number; top: number; width: number; maxHeight: number; side: string };

// A contact HQ can hit: its strikes are in the anchor (ILI-1302).
const strikeable = (e: GameState['events'][number]) => e.kind === 'contact' && e.id.startsWith('contact-');

// Anything else in this square HQ can act on: an unresolved event that isn't a strike. (Resupply
// is only ever a reply to ALPHA's ask, ILI-1232. A kill site has nothing to do until ALPHA
// reaches it and asks, so it gets no card: the X marks are the aftermath, ILI-1252.)
const actionable = (square: string) => (e: GameState['events'][number]) => e.square === square && e.status !== 'resolved' && !strikeable(e) && e.kind !== 'site';
export function hasActions(s: GameState, square: string) {
  return s.events.some(actionable(square));
}

// Beside the square, on the side away from ALPHA when both have room (so ALPHA's flag stays
// clear), top level with it, kept inside the open map. Each side tries level with the square,
// then below what's floating at the top (the status widget), then down at the map's foot,
// and takes the first spot clear of the other panels and ALPHA (ILI-1215).
function beside(square: string, area: Area, height: number, team: { x: number; y: number }, width: number): Placed {
  const sq = squareBox(square);
  const alpha = alphaBox(team);
  const maxHeight = area.height - 16;
  if (!sq) return { left: area.x + 8, top: area.y + 8, width: width, maxHeight, side: 'right' };
  const h = height || 300;
  const lo = area.y + 8;
  const hi = area.y + area.height - 8 - h;
  const clampTop = (y: number) => Math.max(lo, Math.min(y, hi));
  const others = obstacles(['card', 'actions', 'flag']);
  const tops = [sq.y, ...others.map((o) => o.y + o.h + 8), hi].map(clampTop);
  const right = { x: sq.x + sq.w + 10, side: 'right' };
  const left = { x: sq.x - 10 - width, side: 'left' };
  const fits = (x: number) => x >= area.x + 8 && x + width <= area.x + area.width - 8;
  const alphaRight = !!alpha && alpha.x + alpha.w / 2 > sq.x + sq.w / 2;
  // Then the open map's far edges (ILI-1227): with the camera centred on ALPHA, beside the
  // square can be right on top of it.
  const edges = [
    { x: area.x + area.width - 8 - width, side: 'right' },
    { x: area.x + 8, side: 'left' },
  ];
  const sides = [...(alphaRight ? [left, right] : [right, left]), ...edges].filter((c) => fits(c.x));
  if (!sides.length) sides.push({ x: Math.max(area.x + 8, Math.min(sq.x - 10 - width, area.x + area.width - 8 - width)), side: 'left' });
  // Close to its square first (ILI-1302): level with it either side, then right under it or
  // right over it, before anywhere further off.
  const near = sides.slice(0, 2).map((c) => ({ x: c.x, y: tops[0], w: width, h, side: c.side }));
  const ux = Math.max(area.x + 8, Math.min(sq.x, area.x + area.width - 8 - width));
  const under = { x: ux, y: sq.y + sq.h + 10, w: width, h, side: 'below' };
  const over = { x: ux, y: sq.y - 10 - h, w: width, h, side: 'above' };
  const inMap = (b: { y: number; h: number }) => b.y >= area.y + 8 && b.y + b.h <= area.y + area.height - 8;
  const spots = [...near, ...[under, over].filter(inMap), ...sides.flatMap((c) => tops.slice(1).map((y) => ({ x: c.x, y, w: width, h, side: c.side })))];
  const at = pick(spots, [...others, alpha, sq]);
  return { left: at.x, top: at.y, width: width, maxHeight, side: at.side };
}

const SLACK = 32; // px a measured height may shrink by before the panel moves for it
const settle = (was: number, now: number) => (now > was || was - now > SLACK ? now : was);


// The anchor's contents (ILI-1302): the square and its status, Get eyes on it, its fighters and
// their strikes, anything else going on there, then its facts.
export function Card({ s, square }: { s: GameState; square: string }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const working = sat.aim === square && sat.state !== 'idle'; // ORION-3 is on this square
  const result = sat.state === 'idle' && sat.result?.square === square ? sat.result : null;
  const g = ground(s, square)!;
  const wx = weather(s);
  const snap = s.imagery[square];
  const seen = snap ? freshness(snap, now) : null;
  const found = s.contacts.filter((c) => c.square === square && c.status === 'revealed');
  const marked = targets(s).filter((t) => squareAt(t.x, t.y) === square);
  const strikes = s.events.filter((e) => e.square === square && strikeable(e) && e.status !== 'resolved');
  const status = working
    ? sat.state === 'slewing'
      ? `ORION-3 ${countdown(sat.arriveMs - now)} away`
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

      <EyesOn s={s} square={square} />

      {/* OVERWATCH at work on this square (ILI-1303): not ORION-3, which only watches. */}
      <SniperPanel square={square} />

      {/* Its fighters, and every way to hit them (ILI-1230, ILI-1270), here at their square. */}
      {strikes.length > 0 && (
        <section className="sc-strikes" data-testid="strike-menu" aria-label={`Strike ${square}`}>
          {marked.length > 0 && (
            <p className="sc-marked" data-testid="fighters-marked">
              {marked.length} {marked.length === 1 ? 'fighter' : 'fighters'} marked
            </p>
          )}
          {strikes.map((e) => (
            <div key={e.id} className="sc-event event-card" data-kind="contact" data-testid="event-card">
              <h3>CONTACT · {e.square}</h3>
              <p className="title">{e.title}</p>
              <TargetMenu contactId={e.id.slice('contact-'.length)} />
            </div>
          ))}
        </section>
      )}

      {hasActions(s, square) && (
        <section className="sc-actions" data-testid="action-panel" aria-label={`Act on ${square}`}>
          <Actions s={s} square={square} />
        </section>
      )}

      <div className="sc-body">
        {/* The one home for a square's details (ILI-1220): the clock widget no longer repeats them. */}
        <dl className="facts" data-testid="square-facts">
          <dt>Elevation</dt>
          <dd data-testid="square-elevation">
            {g.lowM}–{g.highM} m
          </dd>
          <dt>Slope</dt>
          <dd>{g.slope}</dd>
          <dt>Features</dt>
          <dd>{g.features.length ? g.features.join(', ') : 'open ground'}</dd>
          <dt>Weather</dt>
          <dd>
            {wx.sky.toLowerCase()} · vis {wx.visibilityKm} km · {wx.light.toLowerCase()}
          </dd>
          <dt>Imagery</dt>
          <dd>{snap ? `${snap.mode === 'eyes' ? 'eyes on' : snap.mode} ${zulu(snap.atMs)} · ${seen}` : g.imagery}</dd>
          <dt>Contacts</dt>
          <dd data-testid="square-contacts">
            {found.length ? `${found.length} · ${found.map((c) => c.label).join(', ')}` : snap ? 'none seen' : 'not looked at yet'}
          </dd>
        </dl>
      </div>
    </>
  );
}

// Get eyes on the square (ILI-1278 decision 2): what was Reposition in ORION-3's panel, said as
// what it does. Under it, when ORION-3 would be on station; once it's there, the shot is in
// ORION-3's panel.
function EyesOn({ s, square }: { s: GameState; square: string }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const tied = s.minigame?.status === 'active';
  const here = sat.aim === square;
  const away = slewMs(s, square);
  const [label, sub, can] = tied
    ? [`Get eyes on ${square}`, 'ORION-3 · tied up by the intercept', false]
    : here && sat.state === 'slewing'
      ? [`ORION-3 on its way`, `on station in ${countdown(sat.arriveMs - now)}`, false]
      : here && sat.state === 'capturing'
        ? [`ORION-3 looking at ${square}`, gameSpan(sat.captureUntilMs - now), false]
        : here && (sat.state === 'onStation' || away === 0)
          ? [`ORION-3 is over ${square}`, 'Photo, Burst or Video in its panel', false]
          : sat.state === 'capturing'
            ? [`Get eyes on ${square}`, `ORION-3 · busy over ${sat.aim}`, false]
            : [`Get eyes on ${square}`, `ORION-3 · on station in ${countdown(away)}`, true];
  return (
    <div className="sc-eyes">
      <button className="eyes-on" disabled={!can} onClick={() => game.lookAt(square)} data-testid="look-here">
        {label}
        <small>{sub}</small>
      </button>
    </div>
  );
}

// What HQ can do about the square (ILI-1211): one block per thing going on there, with its
// options.
export function Actions({ s, square }: { s: GameState; square: string }) {
  // Strikes have their own block above (ILI-1302): the rest goes here.
  const events = s.events.filter(actionable(square));
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
          {e.kind === 'signal' ? (
            <div className="signal-options">
              <button className="intercept" onClick={() => game.intercept(e.id)}>
                Listen
              </button>
              <button className="jam" onClick={() => game.jam(e.id)} title="Slows the enemy, but you won't learn what they're planning">
                Jam
              </button>
            </div>
          ) : (
            <Call s={s} eventId={e.id} />
          )}
        </div>
      ))}
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
