import { game, useGame } from '../sim/store';
import { satName } from '../sim/satellite';
import { strikeState } from './SquareCard';
import { TargetMenu } from './TargetMenu';
import { cash } from './MissionBar';

// The strike flyout (ILI-1467, the ILI-1459 design): every strike is ORION-3's. Its Strike button
// slides this out of ORION-3's left edge, for the square ORION-3 is locked on and only that one:
// the budget, then each contact there with every way to hit it. Firing closes it, and ORION-3's
// picture goes to targeting while the strike plays out on the square (OrionPanel).
export function StrikeFlyout() {
  const s = useGame((x) => x);
  const square = s.satellite.aim;
  const st = strikeState(s, square);
  // Open while the opened event is a contact on this square (Strike opens one; so does a fighter's
  // panel, or a contact's report).
  const ev = s.events.find((e) => e.id === s.openEvent);
  const open = !!ev && ev.kind === 'contact' && ev.square === square && st.can;
  if (!open) return null;
  return (
    <section className="panel strike-flyout" data-testid="strike-flyout" aria-label={`Strike ${square}`}>
      <header className="sf-head">
        <b>Strike · {square}</b>
        <span>{satName(s)} over it</span>
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
