import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { CAPTURE, lockedOn, satName, slewMs } from '../sim/satellite';
import { isImageryRequest } from '../sim/imageryRequest';
import { settled, squareFindings, squareReports } from '../sim/intel';
import { MiniGamePanel } from './MiniGamePanel';
import { freshness, targets } from '../sim/imagery';
import { squareAt } from '../map/grid';
import { TargetMenu } from './TargetMenu';
import { SniperPanel } from './SniperPanel';
import { AirPanel } from './AirPanel';
import { AIR, airGone, arrived } from '../sim/air';
import { SNIPER_CALLSIGN, sniperGone } from '../sim/sniper';
import { ground, weather } from '../sim/conditions';
import { countdown, gameSpan, zulu } from '../sim/gameTime';
import { EVENT_LABEL } from '../sim/stream';
import { useTier } from './tier';
import { alphaBox, obstacles, pick, squareBox } from './overlays';
import type { GameState } from '../sim/state';

const ANCHOR_W = 260; // the menu's width off its square's edge

// The square's anchor (ILI-1278, ILI-1302, ILI-1308): the contextual menu for the square HQ
// picked, pinned beside it on the map, so what's done there stays tied to its ground however
// many things are going on. Only what HQ can *do* to the square: its fighters and every way to
// strike them, the sniper, drone and heli at work on it, anything else going on there (a
// signal, a request). It only opens when there's something to act on. What's known of the
// square, and Reposition, are ORION-3's (OrionPanel). Beside the square on the side away from
// ALPHA and clear of the other panels; on a phone, a strip along the foot of the map.
// What happens on a square stays with the square (ILI-1367): every picked square opens it, and
// a mini game plays here, at its square.
// The satellite is the player's avatar (ILI-1397): the menu grows out of the reticle's edge and
// moves with it. On a square ORION-3 isn't locked on, the menu is the one move step, "Move
// ORION-3 here" and its travel time; locked on, that square's actions, and only the valid ones.
export function SquareCard() {
  const s = useGame((x) => x);
  const playing = s.minigame?.status === 'active' ? s.minigame : null;
  const square = playing ? playing.square : s.map.selected;
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
  if (!area) return null;
  if (!square) return <Busy s={s} area={area} picked={null} />;
  const at: Placed = tier === 'compact' ? strip(area, actHeight, !!playing) : attached(square, area, actHeight, s.team.position, ANCHOR_W);
  const locked = lockedOn(s, square);
  return (
    <>
      <Busy s={s} area={area} picked={square} />
      <Leader square={square} area={area} anchor={{ x: at.left, y: at.top, w: at.width, h: Math.min(actHeight || 200, at.maxHeight) }} />
      <section
        ref={actRef}
        className="square-card anchor"
        data-testid="square-anchor"
        data-overlay="actions"
        data-square={square}
        data-side={at.side}
        data-minigame={playing ? playing.kind : undefined}
        data-locked={locked}
        style={{ left: at.left, top: at.top, width: at.width, maxHeight: at.maxHeight }}
        role="group"
        aria-label={`Act on ${square}`}
      >
        {playing ? <MiniGamePanel /> : <AnchorBody s={s} square={square} />}
      </section>
    </>
  );
}

// Many at once (ILI-1306): a strike running on a square that isn't the picked one keeps a
// small grey chip at that square, saying who's at work there and how it's going; a tap opens
// the square's anchor. (ALPHA waiting on HQ has its own orange flag, and a new find its red
// ping: those already pull the eye.)
function Busy({ s, area, picked }: { s: GameState; area: Area; picked: string | null }) {
  const now = s.elapsedMs;
  const work: { square: string; text: string }[] = [];
  if (s.sniper && !sniperGone(s.sniper, now)) work.push({ square: s.sniper.square, text: `${SNIPER_CALLSIGN} · ${s.sniper.done ? 'done' : 'firing'}` });
  for (const w of ['drone', 'heli'] as const) {
    const r = w === 'drone' ? s.drone : s.heli;
    if (!r || airGone(r, now)) continue;
    const text = r.doneMs !== null ? 'done' : arrived(r, now) ? 'over target' : countdown(r.arriveMs - now);
    work.push({ square: r.square, text: `${AIR[w].callsign} · ${text}` });
  }
  const bySquare = new Map<string, string[]>();
  for (const w of work) if (w.square !== picked) bySquare.set(w.square, [...(bySquare.get(w.square) ?? []), w.text]);
  return (
    <>
      {[...bySquare].map(([square, lines]) => {
        const sq = squareBox(square);
        if (!sq || sq.x + sq.w < area.x || sq.x > area.x + area.width || sq.y + sq.h < area.y || sq.y > area.y + area.height) return null;
        return (
          <button key={square} className="busy-chip" style={{ left: Math.max(area.x + 4, sq.x + 4), top: Math.max(area.y + 4, sq.y + 4) }} onClick={() => game.selectSquare(square)} data-testid="busy-chip" data-square={square}>
            <b>{square}</b>
            {lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </button>
        );
      })}
    </>
  );
}

// The anchor's leader (ILI-1305): a line from the anchor to its square, so the two read as one
// however far apart they sit. When the square is off the open map, the line stops at the map's
// edge in an arrow with the square's name, pointing the way to it.
function Leader({ square, area, anchor }: { square: string; area: Area; anchor: Box }) {
  const sq = squareBox(square);
  if (!sq) return null;
  const centre = { x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 };
  const inside = (p: { x: number; y: number }) => p.x >= area.x && p.x <= area.x + area.width && p.y >= area.y && p.y <= area.y + area.height;
  const nearest = (b: Box, p: { x: number; y: number }) => ({ x: Math.max(b.x, Math.min(p.x, b.x + b.w)), y: Math.max(b.y, Math.min(p.y, b.y + b.h)) });
  const off = !inside(centre);
  // Off the map: the arrow goes on the map's edge (inset a little) where a line from the map's
  // middle to the square crosses it, so it points the way the square lies.
  let to = nearest(sq, nearest(anchor, centre));
  let a = 0;
  if (off) {
    const m = 16;
    const mid = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    const dx = centre.x - mid.x;
    const dy = centre.y - mid.y;
    const t = Math.min(dx ? (dx > 0 ? area.x + area.width - m - mid.x : area.x + m - mid.x) / dx : Infinity, dy ? (dy > 0 ? area.y + area.height - m - mid.y : area.y + m - mid.y) / dy : Infinity);
    to = { x: mid.x + dx * t, y: mid.y + dy * t };
    a = Math.atan2(dy, dx);
  }
  const from = nearest(anchor, to);
  if (Math.hypot(to.x - from.x, to.y - from.y) < 6 && !off) return null; // touching: nothing to draw
  if (!off) a = Math.atan2(to.y - from.y, to.x - from.x);
  const head = (r: number, da: number) => `${to.x - Math.cos(a + da) * r},${to.y - Math.sin(a + da) * r}`;
  return (
    <svg className="anchor-leader" data-testid="anchor-leader" data-off={off || undefined} aria-hidden>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      {off ? (
        <>
          <polygon points={`${to.x},${to.y} ${head(15, 0.5)} ${head(15, -0.5)}`} />
          <text x={to.x - Math.cos(a) * 30} y={to.y - Math.sin(a) * 22 + 4} data-testid="anchor-off">
            {square}
          </text>
        </>
      ) : (
        <circle cx={to.x} cy={to.y} r="3" />
      )}
    </svg>
  );
}

// On a phone (ILI-1302): the width of the map, along its foot, at most half its height. A mini
// game may take the whole map (ILI-1367): it's the one thing going on.
function strip(area: Area, height: number, whole = false): Placed {
  const maxHeight = whole ? area.height - 16 : Math.round(area.height * 0.5);
  const h = Math.min(height || 200, maxHeight);
  return { left: area.x + 8, top: area.y + area.height - 8 - h, width: area.width - 16, maxHeight, side: 'foot' };
}

type Area = NonNullable<ReturnType<typeof getMapRect>>;

type Box = { x: number; y: number; w: number; h: number };

type Placed = { left: number; top: number; width: number; maxHeight: number; side: string };

// A contact HQ can hit: its strikes are in the anchor (ILI-1302).
const strikeable = (e: GameState['events'][number]) => e.kind === 'contact' && e.id.startsWith('contact-');

// Anything else in this square HQ can act on: an unresolved event that isn't a strike. (Resupply
// is only ever a reply to ALPHA's ask, ILI-1232. A kill site has nothing to do until ALPHA
// reaches it and asks, so it gets no card: the X marks are the aftermath, ILI-1252.)
// ALPHA's imagery request is answered by Scan, at the top (ILI-1367).
const actionable = (square: string) => (e: GameState['events'][number]) => e.square === square && e.status !== 'resolved' && !strikeable(e) && e.kind !== 'site' && !isImageryRequest(e);
export function hasActions(s: GameState, square: string) {
  return s.events.some(actionable(square));
}

// Off the reticle's edge (ILI-1397): flush against the square, so the menu and the square read as
// one thing and move together. Right of it, else left, else under or over it, whichever is
// clear of ALPHA and the other panels, kept inside the open map.
function attached(square: string, area: Area, height: number, team: { x: number; y: number }, width: number): Placed {
  const sq = squareBox(square);
  const maxHeight = area.height - 16;
  if (!sq) return { left: area.x + 8, top: area.y + 8, width, maxHeight, side: 'right' };
  const h = Math.min(height || 160, maxHeight);
  const cx = (x: number) => Math.max(area.x + 8, Math.min(x, area.x + area.width - 8 - width));
  const cy = (y: number) => Math.max(area.y + 8, Math.min(y, area.y + area.height - 8 - h));
  const spots = [
    { x: cx(sq.x + sq.w), y: cy(sq.y), w: width, h, side: 'right' },
    { x: cx(sq.x - width), y: cy(sq.y), w: width, h, side: 'left' },
    { x: cx(sq.x), y: cy(sq.y + sq.h), w: width, h, side: 'below' },
    { x: cx(sq.x), y: cy(sq.y - h), w: width, h, side: 'above' },
  ];
  // The prompt moves out of the menu's way, not the other way round: the menu stays flush with its
  // square, and the prompt has a leader line to reach its own (ILI-1393).
  const at = pick(spots, [...obstacles(['card', 'actions', 'flag', 'prompt']), alphaBox(team), sq]);
  return { left: at.x, top: at.y, width, maxHeight, side: at.side };
}

const SLACK = 32; // px a measured height may shrink by before the panel moves for it
const settle = (was: number, now: number) => (now > was || was - now > SLACK ? now : was);


// The anchor's contents (ILI-1302, ILI-1308): the square, what's hitting it, its fighters and
// every way to strike them, then anything else going on there.
function AnchorBody({ s, square }: { s: GameState; square: string }) {
  const marked = targets(s).filter((t) => squareAt(t.x, t.y) === square);
  // Strikes only once a look (photo or video) shows fighters here and isn't stale (ILI-1417): a radio
  // report of a contact is a report, not a target.
  const look = s.imagery[square];
  // A strike under way here (ILI-1425): its panel takes the options' place until it signs off.
  const now = s.elapsedMs;
  const running = (!!s.sniper && s.sniper.square === square && !sniperGone(s.sniper, now)) || [s.drone, s.heli].some((r) => !!r && r.square === square && !airGone(r, now));
  const seenHere = !!look && freshness(look, s.elapsedMs) !== 'stale' && marked.length > 0;
  const strikes = s.events.filter((e) => e.square === square && strikeable(e) && e.status !== 'resolved');
  const locked = lockedOn(s, square);
  return (
    <>
      <header className="sc-head">
        <b>{square}</b>
        <span className="sc-status" data-testid="lock-status">
          {locked ? `${satName(s)} locked on` : `${satName(s)} not over it`}
        </span>
        <button className="x" onClick={() => game.closeSquare()} aria-label="Close">
          ×
        </button>
      </header>

      {/* What its scan turned up (ILI-1399): the detail readouts, tier three, opened by tapping the
          square. One scan settled it, so there's no Scan here again. */}
      <Readouts s={s} square={square} />
      <Details s={s} square={square} />

      {/* What's hitting this square: OVERWATCH (ILI-1303), REAPER-1 and HAMMER-2 (ILI-1304).
          Work already under way, so it shows locked or not. */}
      <SniperPanel square={square} />
      <AirPanel weapon="drone" square={square} />
      <AirPanel weapon="heli" square={square} />

      {!locked ? (
        <MoveHere s={s} square={square} />
      ) : (
        <>
          {settled(s, square) ? null : <Scan s={s} square={square} />}

          {/* Its fighters, and every way to hit them (ILI-1230, ILI-1270), here at their square. */}
          {/* The options fold away while a strike runs, and slide back after (ILI-1425). */}
          <Fold open={seenHere && strikes.length > 0 && !running}>
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
          </Fold>

          {/* Team actions come out of the same menu (ILI-1397). */}
          {hasActions(s, square) && (
            <section className="sc-actions" data-testid="action-panel" aria-label={`Act on ${square}`}>
              <Actions s={s} square={square} />
            </section>
          )}
        </>
      )}
    </>
  );
}

// The square's intel (ILI-1399): every report its scan brought in, by discipline, or that it
// came up clear. Once a square has one, it's settled.
function Readouts({ s, square }: { s: GameState; square: string }) {
  if (!settled(s, square)) return null;
  const items = squareReports(s, square);
  const clear = squareFindings(s, square) === 'clear';
  return (
    <section className="sc-intel" data-testid="square-intel" data-clear={clear || undefined} aria-label={`Intel on ${square}`}>
      <p className="sc-settled" data-testid="square-settled">
        {clear ? '✓ Settled · clear' : `◆ Settled · ${items.length} ${items.length === 1 ? 'report' : 'reports'}`}
      </p>
      <ul>
        {items.map((r, i) => (
          <li key={i} data-kind={r.kind} data-heat={r.heat} data-testid="square-intel-item">
            <i className="int">{r.kind}</i>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The slew step (ILI-1397): on a square ORION-3 isn't over, the menu's one action is to move it
// here, with how long that takes. It slews in real time; on arrival the reticle locks and the
// square's actions take this one's place.
function MoveHere({ s, square }: { s: GameState; square: string }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const coming = sat.state === 'slewing' && sat.aim === square;
  const busy = sat.state === 'capturing';
  const waiting = s.events.filter((e) => e.square === square && e.status !== 'resolved' && e.kind !== 'site').length;
  return (
    <div className="sc-scan sc-move" data-testid="square-move">
      {waiting > 0 && <p className="sc-asked">{waiting === 1 ? 'Something here to act on' : `${waiting} things here to act on`}</p>}
      <button onClick={() => game.moveSatellite(square)} disabled={coming || busy} data-testid="move-here">
        <span>{coming ? `${satName(s)} on its way` : `Move ${satName(s)} here`}</span>
        <small>{coming ? `Locks on in ${countdown(sat.arriveMs - now)}` : busy ? `Busy over ${sat.aim}` : `${countdown(slewMs(s, square))} to get here`}</small>
      </button>
    </div>
  );
}

// Scan (ILI-1367): the square's own way to get a look, the photo now. Only with ORION-3 locked on
// (ILI-1397). It pulses when ALPHA is asking for imagery of this square.
function Scan({ s, square }: { s: GameState; square: string }) {
  const asked = s.events.find((e) => e.square === square && e.status !== 'resolved' && isImageryRequest(e));
  const busy = s.satellite.state === 'capturing';
  return (
    <div className="sc-scan" data-testid="square-scan">
      {asked && <p className="sc-asked">{asked.title}</p>}
      <button onClick={() => game.scan(square)} disabled={busy} data-testid="scan-square" data-cue={(!!asked && !busy) || undefined}>
        <span>Scan {square}</span>
        <small>{busy ? `${satName(s)} busy over ${s.satellite.aim}` : 'Photo now'}</small>
      </button>
    </div>
  );
}

// A square's details (ILI-1203, ILI-1220): tier three since the satellite panel's ladder
// (ILI-1400), in the square's own menu, folded under one line that says how fresh its imagery is.
export function Details({ s, square }: { s: GameState; square: string }) {
  const sat = s.satellite;
  const now = s.elapsedMs;
  const working = sat.aim === square && sat.state !== 'idle'; // ORION-3 is on this square
  const g = ground(s, square)!;
  const wx = weather(s);
  const snap = s.imagery[square];
  const seen = snap ? freshness(snap, now) : null;
  const found = s.contacts.filter((c) => c.square === square && c.status === 'revealed');
  const status = working
    ? sat.state === 'slewing'
      ? `${satName(s)} ${countdown(sat.arriveMs - now)} away`
      : sat.state === 'onStation'
        ? `${satName(s)} on station`
        : `${satName(s)} ${CAPTURE[sat.mode!].label.toLowerCase()} · ${gameSpan(sat.captureUntilMs - now)}`
    : snap
      ? `imaged ${zulu(snap.atMs)} · ${seen}`
      : 'no imagery';
  return (
    <details className="sc-details square-card-details" data-testid="square-card" data-square={square}>
      <summary>
        Ground · <span data-testid="square-status">{status}</span>
      </summary>
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
    </details>
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
          {e.kind === 'building' ? (
            // The hunt (ILI-1316): worth mission time? ALPHA detours through it and searches it.
            <div className="signal-options">
              {s.searching.includes(e.square) ? (
                <p className="note">{s.team.callsign} is on its way to search it.</p>
              ) : (
                <button onClick={() => game.search(e.square)} data-testid="send-search">
                  Send {s.team.callsign} to search it
                </button>
              )}
            </div>
          ) : e.kind === 'signal' ? (
            // Listening starts from getting an asset in range, through the prompt (ILI-1394). Jam
            // is no mini game: it's here.
            <div className="signal-options">
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

// A section that slides in when it opens and folds shut when it closes (ILI-1425): its buttons
// leave one after another, then it collapses with no jump; reduced motion just swaps.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  useLayoutEffect(() => {
    const el = ref.current;
    if (open) {
      setMounted(true);
      if (el) el.style.maxHeight = '';
      return;
    }
    if (!el || still()) return void setMounted(false);
    el.style.maxHeight = `${el.scrollHeight}px`;
    const raf = requestAnimationFrame(() => (el.style.maxHeight = '0px'));
    const t = setTimeout(() => setMounted(false), FOLD_MS);
    return () => (cancelAnimationFrame(raf), clearTimeout(t));
  }, [open]);
  if (!open && !mounted) return null;
  return (
    <div ref={ref} className="sc-fold" data-leaving={!open || undefined}>
      {children}
    </div>
  );
}
const FOLD_MS = 320;
