import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
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

const STRIKE_W = 288; // the strike panel's width at scale 1: three 80 px icons and their padding (ILI-1539)
const MIN_H = 200; // the least room below its square the open panel needs before it rides up

// Strikes aren't intel and they aren't ORION-3 (ILI-1524): a square with fighters that threaten
// ALPHA gets its own ALERT, a red hazard band on the square's bottom edge. A click focuses the
// square and opens the band downward into the strike panel: the options, then the asset under way
// and its time to target. The panel's home is always below its square, right-aligned with it, so
// it and the square's flyout (always to the right) never cover each other; both float above
// everything else on the map. Nothing opens on its own: the ALERT is a button the player clicks.

// Which square's strike panel is open: the HUD's own state, not the sim's. A strike clears the
// open event when it launches, and the panel has to stay up to show the asset.
let openSquare: string | null = null;
const subs = new Set<() => void>();
const setOpen = (sq: string | null) => {
  if (openSquare === sq) return;
  openSquare = sq;
  subs.forEach((f) => f());
};
export const closeStrike = () => setOpen(null);
export const useStrikeOpen = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => openSquare,
  );

export function StrikeAlerts() {
  const s = useGame((x) => x);
  const open = useStrikeOpen();
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
  // The panel belongs to the focused square: it closes when HQ focuses another one, closes the
  // square, or the threat there is dealt with.
  const stale = !!open && (s.map.selected !== open || !squares.includes(open));
  useEffect(() => {
    if (stale) closeStrike();
  }, [stale]);
  const area = getMapRect();
  if (!area || s.phase === 'exited') return null;
  return (
    <>
      {squares.map((sq) => (
        <Alert key={sq} s={s} square={sq} open={open === sq && !stale} area={area} />
      ))}
    </>
  );
}

type Area = NonNullable<ReturnType<typeof getMapRect>>;

function Alert({ s, square, open, area }: { s: GameState; square: string; open: boolean; area: Area }) {
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
  const line = work ?? (n ? `${n} tango` : square);
  const toggle = () => {
    if (open) return closeStrike();
    // Focus the square too: its flyout comes up to the right, the strike panel below.
    if (st.strikes[0]) game.openEvent(st.strikes[0].id);
    else if (game.get().map.selected !== square) game.selectSquare(square);
    setOpen(square);
  };

  // Its home (ILI-1524): hanging off the square's bottom edge, right-aligned with the square, so the
  // flyout beside the square never meets it. Closed, the square's width; open, the panel's. It sits
  // beneath the game UI and inside the open map (ILI-1546). With no room below its square, the open
  // panel goes to the square's left (ILI-1547 call B). Off the open map, or under a game UI panel,
  // the closed band gives way to an edge marker that pans the map to it. On a phone the open panel
  // is the strip along the map's foot.
  const compact = tier === 'compact';
  const width = open ? (compact ? area.width - 16 : Math.max(sq.w, STRIKE_W * k)) : Math.max(sq.w, 96 * k);
  const ht = h || (open ? 240 : 28);
  const mapTop = area.y + 8;
  const mapFoot = area.y + area.height - 8;
  let left = sq.x + sq.w - width;
  let top = sq.y + sq.h;
  let maxHeight: number | undefined;
  if (open && compact) {
    maxHeight = Math.round(area.height * 0.6);
    left = area.x + 8;
    top = mapFoot - Math.min(ht, maxHeight);
  } else if (open) {
    if (mapFoot - top < MIN_H) {
      left = sq.x - width;
      top = sq.y;
      if (left < area.x + 8) left = sq.x + sq.w; // no room left either: the right side
    }
    left = Math.max(area.x + 8, Math.min(left, area.x + area.width - 8 - width));
    top = Math.max(mapTop, Math.min(top, mapFoot - MIN_H));
    maxHeight = mapFoot - top;
  } else {
    left = Math.max(area.x + 8, Math.min(left, area.x + area.width - 8 - width));
    const off = top < area.y || top > area.y + area.height - ht || sq.x + sq.w < area.x || sq.x > area.x + area.width;
    if (off || coveredBy({ x: left, y: top, w: width, h: ht }) > 0.5)
      return <EdgeMarker square={square} target={{ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }} area={area} label="Alert" />;
  }

  return (
    <section
      ref={ref}
      className="strike-alert"
      data-testid="strike-alert"
      data-overlay={open ? 'strike' : 'alert'}
      data-square={square}
      data-open={open || undefined}
      data-tier={tier}
      style={{ left, top, width, maxHeight, '--k': k } as CSSProperties}
      role="group"
      aria-label={`Alert ${square}`}
    >
      <button className="sa-band" onClick={toggle} aria-expanded={open} data-testid="alert-button" data-work={work ? true : undefined}>
        <i className="sa-hazard" aria-hidden />
        <b>Alert</b>
        <small data-testid="alert-line">{line}</small>
        {/* The one thing to press, in the word for what it does (ILI-1534, option A). */}
        {!open && !work && (
          <span className="sa-go" data-testid="alert-strike">
            Strike ▸
          </span>
        )}
        <i className="sa-hazard" aria-hidden />
      </button>
      {open && (
        <div className="sa-body" data-testid="strike-panel">
          <Stages stage={st.running ? 'asset' : 'options'} order={STAGES}>
            {st.running ? <StrikeAsset square={square} /> : <StrikeOptions s={s} square={square} />}
          </Stages>
        </div>
      )}
    </section>
  );
}

const STAGES = ['options', 'asset'] as const;

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
