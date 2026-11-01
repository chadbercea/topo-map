import { useState } from 'react';
import { game, useGame } from '../sim/store';
import { Store } from './Store';
import { UPGRADES } from '../sim/upgrades';
import { cantBuy } from './ledger';
import { intro, introOn } from './intro';
import { wrapUp } from '../sim/wrapup';
import { gameClock } from '../sim/gameTime';

const HEADLINE = { win: 'MISSION SUCCESS', casualties: 'MISSION COMPLETE · CASUALTIES', failed: 'MISSION FAILED', bankrupt: 'BANKRUPT' } as const;
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const clock = (ms: number) => gameClock(ms, Math.floor);

// End of mission, the After Action Report (ILI-1264): outcome, objectives, what HQ's intel did, new intel, payout and budget.
export function WrapUp() {
  const ended = useGame((s) => s.phase === 'ended');
  const state = useGame((s) => s);
  const [store, setStore] = useState(false);
  if (!ended) return null;
  const w = wrapUp(state);
  // The store, between missions (ILI-1317): not for a PMC that's gone bust.
  if (store && w.outcome !== 'bankrupt')
    return (
      <div className="overlay" data-testid="wrapup" data-outcome={w.outcome}>
        <Store close={() => setStore(false)} />
      </div>
    );
  return (
    <div className="overlay" data-testid="wrapup" data-outcome={w.outcome}>
      <section className="panel menu wrapup" role="dialog" aria-label={`After Action Report: ${HEADLINE[w.outcome]}`}>
        <h2>AFTER ACTION REPORT</h2>
        <p className="outcome">
          {HEADLINE[w.outcome]}
          {/* A job done can still lose money (ILI-1316). */}
          {(w.outcome === 'win' || w.outcome === 'casualties') && w.pnl < 0 && ' · AT A LOSS'}
        </p>
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
          <dt>P&amp;L · {clock(w.timeUsedMs)} on the clock</dt>
          {w.payout.map((p) => (
            <div key={p.label}>
              <dd>{p.label}</dd>
              <dd className="v">{money(p.amount)}</dd>
            </div>
          ))}
          <div className="total">
            <dd>This mission</dd>
            <dd className="v" data-testid="pnl" data-loss={w.pnl < 0 || undefined}>
              {money(w.pnl)}
            </dd>
          </div>
          <div className="total">
            <dd>{w.outcome === 'bankrupt' ? 'Balance at shutdown' : 'Balance carried forward'}</dd>
            <dd className="v" data-testid="budget">
              {money(w.budget)}
            </dd>
          </div>
        </dl>
        {w.outcome !== 'bankrupt' && (
          <button onClick={() => setStore(true)} data-testid="open-store" data-cue={UPGRADES.some((u) => !cantBuy(u.id)) || undefined}>
            Upgrades
          </button>
        )}
        <button onClick={intro.reboot}>{w.outcome === 'bankrupt' ? 'Start a new PMC' : w.outcome === 'failed' ? 'Retry mission' : 'Play again'}</button>
        <button onClick={introOn ? intro.home : game.exit}>Exit</button>
      </section>
    </div>
  );
}
