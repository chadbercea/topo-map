import { game, useGame } from '../sim/store';
import { wrapUp } from '../sim/wrapup';

const HEADLINE = { win: 'MISSION SUCCESS', casualties: 'MISSION COMPLETE · CASUALTIES', failed: 'MISSION FAILED' } as const;
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// End of mission: outcome, objectives, what HQ's intel did, new intel, payout and budget.
export function WrapUp() {
  const ended = useGame((s) => s.phase === 'ended');
  const state = useGame((s) => s);
  if (!ended) return null;
  const w = wrapUp(state);
  return (
    <div className="overlay" data-testid="wrapup" data-outcome={w.outcome}>
      <section className="panel menu wrapup" role="dialog" aria-label={HEADLINE[w.outcome]}>
        <h2>{HEADLINE[w.outcome]}</h2>
        <p className="reason">{w.reason}</p>
        <ul className="objectives">
          {w.objectives.map((o) => (
            <li key={o.label} data-done={o.done}>
              {o.done ? '✓' : '✗'} {o.label}
            </li>
          ))}
        </ul>
        <div className="columns">
          <dl>
            <dt>WITH YOUR INTEL</dt>
            {w.teamWork.map((r) => (
              <div key={r.label}>
                <dd>{r.label}</dd>
                <dd className="v">{r.value}</dd>
              </div>
            ))}
          </dl>
          <dl>
            <dt>NEW INTEL</dt>
            {w.newIntel.map((r) => (
              <div key={r.label}>
                <dd>{r.label}</dd>
                <dd className="v">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <dl className="payout">
          <dt>PAYOUT · {clock(w.timeUsedMs)} on the clock</dt>
          {w.payout.map((p) => (
            <div key={p.label}>
              <dd>{p.label}</dd>
              <dd className="v">{money(p.amount)}</dd>
            </div>
          ))}
          <div className="total">
            <dd>Budget for the next mission</dd>
            <dd className="v" data-testid="budget">
              {money(w.budget)}
            </dd>
          </div>
        </dl>
        <button onClick={game.restart}>{w.outcome === 'failed' ? 'Retry mission' : 'Play again'}</button>
        <button onClick={game.exit}>Exit</button>
      </section>
    </div>
  );
}
