import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { uiScale } from './scale';
import { bus, EV, getMapRect } from '../game/events';
import { BuildingTag, tagSquares } from './PromptLayer';
import { game, useGame } from '../sim/store';
import { lockedOn, satName } from '../sim/satellite';
import { trafficPrompts } from '../sim/prompts';
import { isImageryRequest } from '../sim/imageryRequest';
import { MiniGamePanel } from './MiniGamePanel';
import { countdown } from '../sim/gameTime';
import { EVENT_LABEL } from '../sim/stream';
import { useTier } from './tier';
import { squareBox } from './overlays';
import type { GameState } from '../sim/state';
import { shownEvents } from '../sim/events';
import { buildingId, findIn, searchingIn, SEARCH_MS } from '../sim/buildings';
import { RECOVER_MS } from '../sim/mission';
import { knownIn } from '../sim/contacts';
import { ESCROW_BOX } from '../sim/prices';
import { downloadProgress, kindLabel, shelfState, squareReports } from '../sim/intel';
import { alertSquares, strikeable, strikeState } from '../sim/strike';
import { contactLine, useStrikeOpen } from './StrikeAlert';

const ANCHOR_W = 240; // the flyout's width off its square's edge: compact, so it doesn't bury the map (ILI-1505)

// The square's anchor (ILI-1278, ILI-1302, ILI-1308): the contextual menu for the square HQ
// picked, pinned beside it on the map, so what's done there stays tied to its ground however
// many things are going on: its intel, ALPHA's work there, anything else going on (a signal, a
// request). Strikes aren't here (ILI-1524): they're the square's ALERT (StrikeAlert). Reposition is
// ORION-3's (OrionPanel). Always to the right of its square (ILI-1524); on a phone, a strip along
// the foot of the map.
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
  const strikeOpen = useStrikeOpen();
  const placedKey = useRef('');
  const sideOf = useRef<{ square: string; side: 'right' | 'left' } | null>(null); // the side it opened on, kept while open (ILI-1543)
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
  if (!square) {
    sideOf.current = null; // closed: the next open picks its side afresh
    return null;
  }
  const k = tier === 'wide' ? uiScale() : 1; // it grows with the map's squares (ILI-1498)
  // On a phone the open strike panel takes the strip along the map's foot (ILI-1524): one sheet at a time.
  if (tier === 'compact' && !playing && strikeOpen === square) return null;
  const kept = sideOf.current?.square === square ? sideOf.current.side : undefined;
  const at: Placed = tier === 'compact' ? strip(area, actHeight, !!playing) : attached(square, area, actHeight, ANCHOR_W * k, kept);
  if (at.side === 'right' || at.side === 'left') sideOf.current = { square, side: at.side };
  const locked = lockedOn(s, square);
  // Any square HQ clicks opens its flyout (ILI-1475): its intel is stored on the square, not in the
  // satellite, so it's there wherever ORION-3 is.
  return (
    <>
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
        style={{ left: at.left, top: at.top, width: at.width, maxHeight: at.maxHeight, '--k': k } as CSSProperties}
        role="group"
        aria-label={`Act on ${square}`}
      >
        {playing ? <MiniGamePanel /> : <AnchorBody s={s} square={square} />}
      </section>
    </>
  );
}

// A strike under way on another square shows on that square's CONTACT tag now (ILI-1474).

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

// Anything else on the square HQ may act on, as a plain line in its intel list: not a strike, a
// building or radio traffic (they have their own), not a kill site (its X marks are the
// aftermath, ILI-1252), not ALPHA's imagery ask (its own line).
const otherItem = (square: string) => (e: GameState['events'][number]) =>
  e.square === square && e.status !== 'resolved' && !strikeable(e) && !['site', 'building', 'signal'].includes(e.kind) && !isImageryRequest(e);

// Its home (ILI-1543, Chad 11-14): right of its square, top aligned with it. If there's no room on
// the right inside the open map, it goes left. It never covers its own square. It picks its side
// when it opens and keeps it while open (keep), so it never jumps; it moves only as its square
// moves on screen, and slides up or down to stay inside the map.
function attached(square: string, area: Area, height: number, width: number, keep?: 'right' | 'left'): Placed {
  const sq = squareBox(square);
  const maxHeight = area.height - 16;
  if (!sq) return { left: area.x + 8, top: area.y + 8, width, maxHeight, side: 'right' };
  const h = Math.min(height || 160, maxHeight);
  const roomRight = area.x + area.width - 8 - (sq.x + sq.w);
  const roomLeft = sq.x - (area.x + 8);
  const side = keep ?? (roomRight >= width || roomRight >= roomLeft ? 'right' : 'left');
  const left = side === 'right' ? sq.x + sq.w : sq.x - width;
  const top = Math.max(area.y + 8, Math.min(sq.y, area.y + area.height - 8 - h));
  return { left, top, width, maxHeight, side };
}

const SLACK = 32; // px a measured height may shrink by before the panel moves for it
const settle = (was: number, now: number) => (now > was || was - now > SLACK ? now : was);


// The anchor's contents (ILI-1302, ILI-1308): the head with its status (ORION-3 locked on or on
// its way, ALPHA asking for imagery), then the square's intel list. Its strikes are the ALERT's.
function AnchorBody({ s, square }: { s: GameState; square: string }) {
  const locked = lockedOn(s, square);
  const sat = s.satellite;
  const coming = sat.state === 'slewing' && sat.aim === square;
  // The flyout's status is only what matters (ILI-1506): is ORION-3 locked on here or on its way,
  // and is ALPHA asking for imagery of it. Ground and weather are on ORION-3's picture (ILI-1504).
  const asked = s.events.find((e) => e.square === square && e.status !== 'resolved' && isImageryRequest(e));
  return (
    <>
      <header className="sc-head" data-state={locked ? 'locked' : coming ? 'slewing' : 'away'}>
        <b>{square}</b>
        <span className="sc-status" data-testid="lock-status">
          {locked ? `${satName(s)} locked on` : coming ? `${satName(s)} on its way · ${countdown(sat.arriveMs - s.elapsedMs)}` : `${satName(s)} over ${sat.aim}`}
        </span>
        <button className="x" onClick={() => game.closeSquare()} aria-label="Close">
          ×
        </button>
      </header>
      {asked && (
        <p className="sc-asked" data-testid="square-asked">
          {asked.title}
        </p>
      )}
      <Report s={s} square={square} />
    </>
  );
}

// The square's report.
function Report({ s, square }: { s: GameState; square: string }) {
  const tags = tagSquares(s);
  const contact = alertSquares(s).includes(square) && strikeState(s, square).strikes.length > 0;
  const buildings = tags.buildings.filter((e) => e.square === square);
  const traffic = shownEvents(s).filter((e) => e.square === square && e.kind === 'signal' && e.status !== 'resolved');
  const others = shownEvents(s).filter(otherItem(square));
  const known = knownIn(s, square); // where HQ last saw them (ILI-1493)
  return (
    <>
      {/* ALPHA at work here: a live bar, so it stays out of the folds. */}
      <TeamWork s={s} square={square} />

      {/* The square's intel list (ILI-1487, ILI-1507): compact, a line each. First the intel
          ORION-3 has on the square now (its package's status, then each report by kind), then what
          HQ can act on here: contacts, buildings, radio traffic. */}
      <section className="sc-items" data-testid="intel-list" aria-label={`Intel on ${square}`}>
        <h3 className="sc-items-head">Intel</h3>
        <PackageLine s={s} square={square} />
        <Reports s={s} square={square} />
        {/* The contact is a plain line of the list like the rest (ILI-1490, ILI-1524): intel, not a
            button. Striking it is the square's ALERT. */}
        {contact && <ContactItem s={s} square={square} />}
        {buildings.length > 0 && (
          <div className="sc-tags" data-testid="docked-tags">
            {buildings.map((e) => (
              <div key={e.id} className="place-tag docked" data-testid="place-tag" data-kind="building" data-square={square}>
                <BuildingTag id={e.id} />
              </div>
            ))}
          </div>
        )}
        {/* Fighters HQ last saw here, with no fresh look to strike on (ILI-1493). */}
        {!contact && known.length > 0 && (
          <div className="sc-item" data-kind="contact" data-testid="intel-item">
            <span>Contacts last seen here</span>
            <small className="note">{known.map((c) => c.label).join(', ')}</small>
          </div>
        )}
        {traffic.map((e) => (
          <TrafficItem key={e.id} s={s} id={e.id} square={e.square} />
        ))}
        {others.map((e) => (
          <div key={e.id} className="sc-item" data-kind={e.kind} data-testid="intel-item" data-event={e.id} data-focus={s.openEvent === e.id || undefined}>
            <span>
              {EVENT_LABEL[e.kind]} · {e.square}
            </span>
            <small className="note">{e.title}</small>
          </div>
        ))}
        {!shelfState(s, square) && !squareReports(s, square).length && !contact && !known.length && !buildings.length && !traffic.length && !others.length && (
          <p className="sc-none" data-testid="intel-none">
            No intel on this square yet
          </p>
        )}
      </section>
      <NextStep s={s} square={square} />
    </>
  );
}

// What happens next on this square (ILI-1508), so the flyout, ORION-3 and the comms log read as
// one story: move ORION-3 here, then Analyze, then ALPHA pulls the intel. Nothing while ORION-3 is
// on its way (the head counts it down) or once ALPHA has the intel.
export function nextStep(s: GameState, square: string): string | null {
  const sat = s.satellite;
  const name = satName(s);
  if (lockedOn(s, square)) {
    const st = shelfState(s, square);
    if (!st) return s.intel.graded.includes(square) ? null : `Analyze ${square} in ${name}`;
    return st === 'posted' ? `${s.team.callsign} pulls it when holding or at ${square}` : null;
  }
  if (sat.state === 'slewing' && sat.aim === square) return null;
  if (shelfState(s, square) === 'posted') return `${s.team.callsign} pulls it when holding or at ${square}`;
  return sat.state === 'idle' && !s.intel.graded.includes(square) ? `Reposition ${name} here` : null;
}

function NextStep({ s, square }: { s: GameState; square: string }) {
  const next = nextStep(s, square);
  if (!next) return null;
  return (
    <p className="sc-next" data-testid="square-next">
      <span>Next</span> {next}
    </p>
  );
}

// The square's intel package (ILI-1499): HQ posts it on the shelf; ALPHA pulls it down. One line
// says which, as a plain status (ILI-1509): posted and waiting, downloading (a short bar), or a
// green check and "Intel received" once ALPHA has it.
function PackageLine({ s, square }: { s: GameState; square: string }) {
  const st = shelfState(s, square);
  if (!st) return null;
  const who = s.team.callsign;
  return (
    <div className="sc-item sc-package" data-kind="package" data-state={st} data-testid="square-package">
      {st === 'received' ? (
        <span data-testid="intel-received">
          <b className="check" aria-hidden>
            ✓
          </b>{' '}
          Intel received
        </span>
      ) : (
        <span>{st === 'posted' ? `Intel posted · waiting for ${who}` : `${who} downloading intel`}</span>
      )}
      {st === 'pulling' && (
        <span className="decay fill" role="progressbar" aria-valuenow={Math.round(downloadProgress(s) * 100)}>
          <span style={{ width: `${downloadProgress(s) * 100}%` }} />
        </span>
      )}
    </div>
  );
}

// The intel ORION-3 has on the square now (ILI-1507): each report, one line, labelled by kind
// (ILI-1510) and coloured by how much it says. The full text is on hover where a line runs long.
function Reports({ s, square }: { s: GameState; square: string }) {
  const items = squareReports(s, square);
  if (!items.length) return null;
  return (
    <ul className="sc-reports" data-testid="square-reports">
      {items.map((r, i) => (
        <li key={i} data-kind={r.kind} data-heat={r.heat} title={r.text} data-testid="square-report">
          <i className="int">{kindLabel(r.kind)}</i>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

// Radio traffic heard on the square (ILI-1491): a line of its intel list, not a card or a tag of its
// own. A click on it opens the choice, inline: Listen (an asset gets in range, then the intercept
// plays here) or Jam. While an asset is on its way, the line says so.
function TrafficItem({ s, id, square }: { s: GameState; id: string; square: string }) {
  const listen = trafficPrompts(s).find((p) => p.id === id);
  const going = s.listen?.eventId === id;
  const open = s.openEvent === id || going;
  const locked = lockedOn(s, square);
  return (
    <div className="sc-item sc-traffic" data-kind="signal" data-testid="intel-item" data-event={id} data-focus={s.openEvent === id || undefined}>
      <button className="sc-item-head" onClick={() => (s.openEvent === id ? game.dropEvent() : game.openEvent(id))} aria-expanded={open} data-testid="traffic-item">
        Enemy radio traffic near {square}
      </button>
      {open && listen && (
        <div className="sc-choice" data-testid="traffic-choice">
          <p className="note" data-testid="traffic-hint">
            {listen.hint}
          </p>
          <div className="options">
            {listen.responses.map((r) => (
              <button key={r.id} onClick={() => game.answerPrompt(id, r.id)} disabled={r.disabled} data-response={r.id} data-testid="traffic-listen">
                {r.label}
              </button>
            ))}
            {!going && (
              <button
                onClick={() => game.jam(id)}
                disabled={!locked}
                title={locked ? "Slows the enemy, but you won't learn what they're planning" : `${satName(s)} has to be over ${square}`}
                data-testid="traffic-jam"
              >
                Jam
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The square's contact, as a line of its intel list (ILI-1490, ILI-1524): what's there (who, how
// many fighters marked, how fresh the look). Not a button: strikes are the square's ALERT.
function ContactItem({ s, square }: { s: GameState; square: string }) {
  const st = strikeState(s, square);
  const n = st.marked.length;
  return (
    <div className="sc-item sc-contact" data-kind="contact" data-testid="contact-item" data-square={square} data-event={st.strikes[0]?.id} data-focus={st.strikes.some((e) => e.id === s.openEvent) || undefined}>
      <span className="sc-contact-name">
        Contact · {square}
        {n > 0 && <b data-testid="contact-count"> · {n}</b>}
      </span>
      <span className="note" data-testid="contact-details">
        {contactLine(s, square)}
      </span>
    </div>
  );
}

// ALPHA at work on this square (ILI-1427): a tiny event with its bar filling while it searches a
// building or recovers the black box; when it's done the bar fades and what it found slides into
// its place, and stays as a line of the square's intel.
type Work = { id: string; kind: string; text: string; progress: number } | null;
type Found = { id: string; kind: string; text: string }[];
function teamWork(s: GameState, square: string): { work: Work; found: Found } {
  const now = s.elapsedMs;
  const { mission, team } = s;
  let work: Work = null;
  if (searchingIn(s) === square) work = { id: `search-${square}`, kind: 'Search', text: `${team.callsign} searching the building`, progress: 1 - (team.holdUntilMs - now) / SEARCH_MS };
  else if (mission.b === square && mission.phase === 'objective' && mission.recoverUntilMs !== null)
    work = { id: 'recover', kind: 'Recovery', text: `${team.callsign} recovering the black box`, progress: 1 - (mission.recoverUntilMs - now) / RECOVER_MS };
  const found: Found = [];
  if (s.events.some((e) => e.id === buildingId(square) && e.status === 'resolved')) {
    const f = findIn(s, square);
    found.push({ id: `search-${square}`, kind: 'Search', text: `${team.callsign} found ${f.what} + ammo & meds · +$${f.cash.toLocaleString('en-US')}` });
  }
  if (mission.b === square && mission.blackBox) found.push({ id: 'recover', kind: 'Recovery', text: `${team.callsign} recovered the black box · +$${ESCROW_BOX.toLocaleString('en-US')}` });
  return { work, found };
}

export function TeamWork({ s, square }: { s: GameState; square: string }) {
  const { work, found } = teamWork(s, square);
  // The last bar, kept a moment after it fills so it can fade out as the find slides in.
  const [last, setLast] = useState<Work>(null);
  useEffect(() => {
    if (work) return void setLast(work);
    if (!last) return;
    const t = setTimeout(() => setLast(null), 450);
    return () => clearTimeout(t);
  }, [work?.id, work?.progress, last]);
  const bar = work ?? (last && found.some((f) => f.id === last.id) ? { ...last, progress: 1 } : null);
  if (!bar && !found.length) return null;
  return (
    <section className="sc-work" data-testid="team-work" aria-label={`${s.team.callsign} at ${square}`}>
      {found.map((f) => (
        <p key={f.id} className="sc-found" data-testid="work-found">
          <i className="int">{f.kind}</i>
          <span>{f.text}</span>
        </p>
      ))}
      {bar && (
        <div className="sc-bar" data-leaving={!work || undefined} data-testid="work-bar">
          <p>
            <i className="int">{bar.kind}</i>
            <span>{bar.text}</span>
          </p>
          <span className="decay fill" role="progressbar" aria-valuenow={Math.round(Math.min(1, Math.max(0, bar.progress)) * 100)}>
            <span style={{ width: `${Math.min(1, Math.max(0, bar.progress)) * 100}%` }} />
          </span>
        </div>
      )}
    </section>
  );
}
