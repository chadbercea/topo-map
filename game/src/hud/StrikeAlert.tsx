import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { AGE_LABEL, freshness } from '../sim/imagery';
import { zulu } from '../sim/gameTime';
import { alertSquares, strikeState } from '../sim/strike';
import type { GameState } from '../sim/state';
import { coveredBy, squareBox } from './overlays';
import { EdgeMarker } from './EdgeMarker';
import { uiScale } from './scale';
import { useTier } from './tier';
import { Stages } from './Stages';
import { TargetMenu } from './TargetMenu';
import { SniperPanel } from './SniperPanel';
import { AirPanel } from './AirPanel';
import { cash } from './MissionBar';
import { strikeWork } from './PromptLayer';

export const STRIKE_W = 288; // the strike options' width at scale 1: three 80 px icons and their padding (ILI-1539)

// Strikes aren't intel and they aren't ORION-3 (ILI-1524): a square with fighters that threaten
// ALPHA gets its own ALERT, a red hazard band on the square's bottom edge. One square, one panel
// (ILI-1579): a click opens the square's card, which has the strike options (Threat) at its top.
// Nothing opens on its own: the ALERT is a button the player clicks.

export function StrikeAlerts() {
  const s = useGame((x) => x);
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
  const squares = alertSquares(s);
  const area = getMapRect();
  if (!area || s.phase === 'exited') return null;
  // One loud thing (ILI-1556): only the most urgent ALERT flashes, ALPHA's fight first.
  const loudest = squares.find((sq) => s.team.fight?.square === sq) ?? squares[0];
  return (
    <>
      {squares.map((sq) => (
        <Alert key={sq} s={s} square={sq} open={s.map.selected === sq} area={area} loud={sq === loudest} />
      ))}
    </>
  );
}

type Area = NonNullable<ReturnType<typeof getMapRect>>;

function Alert({ s, square, open, area, loud }: { s: GameState; square: string; open: boolean; area: Area; loud: boolean }) {
  const tier = useTier();
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
  const placed = useRef('');
  useLayoutEffect(() => {
    const el = ref.current;
    const now = el?.offsetHeight ?? 0;
    if (now && Math.abs(now - h) > 1) setH(now);
    // Where it ended up, for the prompt to keep clear of.
    const key = el ? [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight].join() : '';
    if (key !== placed.current) bus.emit(EV.overlays);
    placed.current = key;
  });
  useEffect(() => () => void bus.emit(EV.overlays), []);
  const sq = squareBox(square);
  if (!sq) return null;
  const k = tier === 'wide' ? uiScale() : 1;
  const st = strikeState(s, square);
  const work = strikeWork(s, square);
  const n = st.marked.length;
  const fighting = s.team.fight?.square === square; // ALPHA in it: say so first (ILI-1553)
  const line = work ?? (fighting ? `${s.team.callsign} in contact · ${square}` : n ? `${n} tango · ${square}` : square);
  // One square, one panel (ILI-1579): the ALERT is the square's badge; a click opens the square's
  // card, and the strike options are in it.
  const toggle = () => {
    if (st.strikes[0]) game.openEvent(st.strikes[0].id);
    else if (game.get().map.selected !== square) game.selectSquare(square);
  };

  // Its home (ILI-1524): hanging off the square's bottom edge, right-aligned with the square, so the
  // flyout beside the square never meets it. Closed, the square's width; open, the panel's. It sits
  // beneath the game UI and inside the open map (ILI-1546). With no room below its square, the open
  // panel goes to the square's left (ILI-1547 call B). Off the open map, or under a game UI panel,
  // the closed band gives way to an edge marker that pans the map to it. On a phone the open panel
  // is the strip along the map's foot.
  // Exactly its square's width, hanging off its bottom edge: two alerts on neighbouring squares
  // never overlap (ILI-1561). Off the open map, or under a game UI panel, an edge marker instead.
  const width = sq.w;
  const ht = h || 40;
  const left = Math.max(area.x + 8, Math.min(sq.x + sq.w - width, area.x + area.width - 8 - width));
  const top = sq.y + sq.h;
  const off = top < area.y || top > area.y + area.height - ht || sq.x + sq.w < area.x || sq.x > area.x + area.width;
  if (off || coveredBy({ x: left, y: top, w: width, h: ht }) > 0.5)
    return <EdgeMarker square={square} target={{ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }} area={area} label="Alert" />;

  return (
    <section
      ref={ref}
      className="strike-alert"
      data-testid="strike-alert"
      data-overlay="alert"
      data-square={square}
      data-focus={open || undefined}
      data-loud={loud || undefined}
      data-tier={tier}
      style={{ left, top, width, '--k': k } as CSSProperties}
      role="group"
      aria-label={`Alert ${square}`}
    >
      <button className="sa-band" onClick={toggle} aria-expanded={open} data-testid="alert-button" data-work={work ? true : undefined}>
        <i className="sa-hazard" aria-hidden />
        <b>Alert</b>
        <small data-testid="alert-line">{line}</small>
        {/* The one thing to press, in the word for what it does (ILI-1534, option A). */}
        {!work && (
          <span className="sa-go" data-testid="alert-strike">
            Strike ▸
          </span>
        )}
        <i className="sa-hazard" aria-hidden />
      </button>
    </section>
  );
}

const STAGES = ['options', 'asset'] as const;

// The square card's THREAT section (ILI-1579): the ways to hit it, then the asset under way.
export function Threat({ s, square }: { s: GameState; square: string }) {
  const st = strikeState(s, square);
  return (
    <section className="sq-threat" data-testid="strike-panel" data-square={square} aria-label={`Threat on ${square}`}>
      <Stages stage={st.running ? 'asset' : 'options'} order={STAGES}>
        {st.running ? <StrikeAsset square={square} /> : <StrikeOptions s={s} square={square} />}
      </Stages>
    </section>
  );
}

// The contact the strike is on, in a line: who, how many fighters marked, how fresh the look.
export function contactLine(s: GameState, square: string) {
  const st = strikeState(s, square);
  const look = s.imagery[square];
  const fresh = look ? freshness(look, s.elapsedMs) : null;
  const n = st.marked.length;
  return [
    [...new Set(st.strikes.map((e) => e.title))].join(', '),
    n > 0 ? `${n} ${n === 1 ? 'fighter' : 'fighters'} marked` : '',
    look && fresh ? `${look.mode === 'eyes' ? 'eyes on' : look.mode} ${zulu(look.atMs)} · ${AGE_LABEL[fresh]}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// The first stage (ILI-1525: a HUD unit, read at a glance). The band above already says how many
// fighters; under it one line, the square, how fresh HQ's look is, what's known of the target (say
// FORTIFIED) and the budget on the right; then a row of every way to hit it. A weapon that can't
// fire says why on its button (no lock, no eyes, rearming), so the panel never clicks dead. Two
// contacts on one square get the square and budget on a line of their own, and a line each.
function StrikeOptions({ s, square }: { s: GameState; square: string }) {
  const st = strikeState(s, square);
  const one = st.strikes.length === 1;
  const head = (
    <b className="sf-sq" data-testid="strike-contact">
      {square}
    </b>
  );
  const budget = (
    <span className="sf-cash" title="Budget" aria-label={`Budget ${cash(s.resources.budget)}`}>
      {cash(s.resources.budget)}
    </span>
  );
  return (
    <section className="sc-strike" data-testid="strike-flyout" data-square={square} aria-label={`Strike ${square}`}>
      {!one && (
        <header className="sf-head">
          {head}
          {budget}
        </header>
      )}
      <section className="sc-strikes" data-testid="strike-menu">
        {st.strikes.map((e) => (
          <div key={e.id} className="sc-target" data-testid="strike-target">
            <TargetMenu contactId={e.id.slice('contact-'.length)} title={one ? undefined : shortTitle(e.title)} lead={one ? head : undefined} trail={one ? budget : undefined} />
          </div>
        ))}
      </section>
    </section>
  );
}

// "A fortified checkpoint" reads "fortified checkpoint" as a tag.
const shortTitle = (t: string) => t.replace(/^(a|an|the) /i, '');

// The second stage (ILI-1514): the asset HQ picked, its callsign and wireframe, its time to target
// counting down as a bar, then what it hit. The band above already names it; ORION-3 watches.
function StrikeAsset({ square }: { square: string }) {
  return (
    <section className="sc-strike sc-asset" data-testid="strike-asset" aria-label={`Strike ${square}`}>
      <div className="sc-running" data-testid="strike-running">
        <SniperPanel square={square} />
        <AirPanel weapon="drone" square={square} />
        <AirPanel weapon="heli" square={square} />
      </div>
    </section>
  );
}
