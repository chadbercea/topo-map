import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { satName } from '../sim/satellite';
import { strikeState } from './SquareCard';
import { TargetMenu } from './TargetMenu';
import { cash } from './MissionBar';
import { bus, EV, getMapRect } from '../game/events';
import { squareBox } from './overlays';

// The strike menu (ILI-1474): strikes are HQ's assets, not ORION-3's (it's the eye, not the gun).
// A square whose fresh look shows fighters gets a CONTACT tag on the map (PromptLayer); its Strike
// opens this beside the square: the budget, the fighters marked, and each contact with every way to
// hit it, cost and readiness. Only over a square ORION-3 is locked on (it watches the strike land).
// Firing closes it; the strike plays out on the square, and ORION-3's picture goes to targeting.
export function StrikeFlyout() {
  const s = useGame((x) => x);
  const ev = s.events.find((e) => e.id === s.openEvent);
  const square = ev?.kind === 'contact' ? ev.square : null;
  const st = square ? strikeState(s, square) : null;
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
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
  useEffect(() => {
    const now = ref.current?.offsetHeight ?? 0;
    if (now && Math.abs(now - h) > 1) setH(now);
  });
  if (!square || !st || !st.can) return null;
  const area = getMapRect();
  const sq = squareBox(square);
  const W = 260;
  let style: React.CSSProperties = {};
  if (area && sq) {
    const right = sq.x + sq.w + 8;
    const left = right + W > area.x + area.width - 8 ? sq.x - 8 - W : right;
    const top = Math.max(area.y + 8, Math.min(sq.y, area.y + area.height - 8 - (h || 260)));
    style = { left: Math.max(area.x + 8, left), top, width: W };
  }
  return (
    <section ref={ref} className="panel strike-flyout" data-testid="strike-flyout" data-square={square} style={style} aria-label={`Strike ${square}`}>
      <header className="sf-head">
        <b>Strike · {square}</b>
        <span>{satName(s)} watching</span>
        <button className="x" onClick={() => game.dropEvent()} aria-label="Close">
          ×
        </button>
      </header>
      <p className="sf-budget">
        <small>Budget</small>
        <b>{cash(s.resources.budget)}</b>
      </p>
      <section className="sc-strikes" data-testid="strike-menu">
        {st.marked.length > 0 && (
          <p className="sc-marked">
            {st.marked.length} {st.marked.length === 1 ? 'fighter' : 'fighters'} marked
          </p>
        )}
        {st.strikes.map((e) => (
          <div key={e.id} className="sc-event event-card" data-kind="contact" data-testid="event-card">
            <h3>CONTACT · {e.square}</h3>
            <p className="title">{e.title}</p>
            <TargetMenu contactId={e.id.slice('contact-'.length)} />
          </div>
        ))}
      </section>
    </section>
  );
}
