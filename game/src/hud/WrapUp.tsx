import { useLayoutEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { ExfilPanel, exfilRect } from './ExfilPanel';
import { exfilStage } from '../sim/exfil';
import { intro, introOn } from './intro';
import { wrapUp } from '../sim/wrapup';
import { gameClock } from '../sim/gameTime';
import { RaceBar } from './MissionBar';

const HEADLINE = { win: 'MISSION SUCCESS', casualties: 'MISSION COMPLETE · CASUALTIES', failed: 'MISSION FAILED', bankrupt: 'BANKRUPT' } as const;
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const clock = (ms: number) => gameClock(ms, Math.floor);

// End of mission, the After Action Report (ILI-1264): outcome, objectives, what HQ's intel did, new intel, payout and budget.
export function WrapUp() {
  const ended = useGame((s) => s.phase === 'ended');
  const state = useGame((s) => s);
  const head = useRef<HTMLDivElement>(null);
  // Extracted (ILI-1426): RAVEN-6's panel grows from where it sat into the report's header, then
  // the report unfolds under it.
  const extracted = ended && !!state.exfil && exfilStage(state.exfil, state.elapsedMs) === 'done';
  useLayoutEffect(() => {
    const el = head.current;
    const from = exfilRect;
    if (!extracted || !el || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    // The report scrolls; while the header flies in, let it out of the box, then scroll again.
    const box = el.closest<HTMLElement>('.wrapup');
    if (box) box.style.overflow = 'visible';
    const run = el.animate([{ transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` }, { transformOrigin: 'top left', transform: 'none' }], { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
    const done = () => box && (box.style.overflow = '');
    run.onfinish = done;
    run.oncancel = done;
  }, [extracted]);
  if (!ended) return null;
  const w = wrapUp(state);
  return (
    <div className="overlay" data-testid="wrapup" data-outcome={w.outcome} data-extracted={extracted || undefined}>
      <section className="panel menu wrapup" role="dialog" aria-label={`After Action Report: ${HEADLINE[w.outcome]}`}>
        {extracted && (
          <div className="aar-head" ref={head}>
            <ExfilPanel header />
          </div>
        )}
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
        {/* The race (ILI-1392): time used against ALPHA's walk, here in the debrief. */}
        <RaceBar s={state} />
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
            <dd>{w.outcome === 'bankrupt' ? 'Balance at shutdown' : 'Closing balance'}</dd>
            <dd className="v" data-testid="budget">
              {money(w.budget)}
            </dd>
          </div>
        </dl>
        <button onClick={intro.reboot}>{w.outcome === 'bankrupt' ? 'Start a new PMC' : w.outcome === 'failed' ? 'Retry mission' : 'Play again'}</button>
        <button onClick={introOn ? intro.home : game.exit}>Exit</button>
      </section>
    </div>
  );
}
