import { useEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { exfilStage, TRANSPORT } from '../sim/exfil';
import { intro, introOn } from './intro';
import { wrapUp, type Outcome } from '../sim/wrapup';
import { gameClock } from '../sim/gameTime';
import { RaceBar, RookGlyph } from './MissionBar';
import type { Shot } from '../site/content'; // a type only

const HEADLINE = { win: 'MISSION SUCCESS', casualties: 'MISSION COMPLETE · CASUALTIES', failed: 'MISSION FAILED', bankrupt: 'BANKRUPT' } as const;

// The report's voice (ILI-1528): Castle House talking to the new hire, deadpan, the way an
// intelligence agency would. A headline, its second line, a sign-off, and a last word at the foot.
const COPY: Record<Outcome, { title: string; em: string; sign: string[]; last: string; code: string }> = {
  win: {
    title: 'Welcome to the team.',
    em: 'You’ve got what it takes.',
    sign: ['We’ll be in touch.', 'We already know your location.'],
    last: 'Stay by the phone.',
    code: 'ORION-3 · next pass over your position · 04:12',
  },
  casualties: {
    title: 'Welcome to the team.',
    em: 'You’ve got what it takes.',
    sign: ['We’ll be in touch.', 'We already know your location.'],
    last: 'Stay by the phone.',
    code: 'Condolence letters drafted · signed in your name',
  },
  failed: {
    title: 'Thank you for your time.',
    em: 'We’ll keep your file.',
    sign: ['Don’t contact us.', 'We know where to find you.'],
    last: 'This conversation didn’t happen.',
    code: 'ORION-3 · your position logged · retained indefinitely',
  },
  bankrupt: {
    title: 'Castle House is closed.',
    em: 'It was never here.',
    sign: ['Your access has been revoked.', 'Forget our address. We won’t forget yours.'],
    last: 'Shred this.',
    code: 'Records destroyed · except yours',
  },
};

// The line-drawn models, framed like the Castle House site's (studio.ts): the globe and its
// satellites behind the headline, RAVEN-6 for the extraction, ORION-3 overhead at the foot.
const RED = '#e5484d';
const HERO: Shot = { scene: 'constellation', opacity: 0.85, zoom: [1.1, 1.9], yaw: [-0.9, 0.7], pitch: [0.25, -0.05], pan: [0.45, -0.1, 0.15, -0.05], spin: 0.06 };
const LIFT: Shot = { scene: 'airlift', state: 'done', zoom: [1.6, 2.6], yaw: [-0.5, 0.6], pitch: [0.15, -0.1], pan: [0.3, -0.25, 0, 0], spin: 0 };
const OVERHEAD: Shot = { scene: 'satellite', state: 'idle', opacity: 0.9, zoom: [1.4, 2.4], yaw: [-0.8, 0.9], pitch: [0.45, 0.1], pan: [0.4, 0.05, 0.3, -0.05], spin: 0.04 };

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const clock = (ms: number) => gameClock(ms, Math.floor);
const ratio = (v: string) => {
  const m = /^(\d+) of (\d+)$/.exec(v);
  return m ? Math.min(1, Number(m[1]) / Math.max(1, Number(m[2]))) : null;
};

// A framed model: a box the site's studio draws its shot into, turned and dollied as the report
// scrolls. The studio and Three.js load with the report; without WebGL the box stays empty.
function Stage({ shot, className }: { shot: Shot; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let dead = false;
    let stop = () => {};
    import('../site/studio')
      .then(({ stage }) => {
        if (!dead) stop = stage(host, shot);
      })
      .catch(() => {});
    return () => {
      dead = true;
      stop();
    };
  }, [shot]);
  return <div ref={ref} className={`aar-stage ${className}`} aria-hidden />;
}

function Brackets() {
  return (
    <>
      <i className="aar-br tl" />
      <i className="aar-br tr" />
      <i className="aar-br bl" />
      <i className="aar-br br" />
    </>
  );
}

// A short bar: how much of a whole (bars, not numbers, for gauges).
function Bar({ k, label }: { k: number; label: string }) {
  return (
    <span className="aar-bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100}>
      <s style={{ width: `${k * 100}%` }} />
    </span>
  );
}

// End of mission, the After Action Report (ILI-1264), dressed as Castle House's own page
// (ILI-1528): a big headline over the globe, the readouts, the objectives, ALPHA's walk against
// the clock, what HQ's intel did and turned up, the ledger, and a last word under ORION-3. The
// two actions stay pinned at the foot. Sections rise into place as they scroll in.
export function WrapUp() {
  const ended = useGame((s) => s.phase === 'ended');
  const state = useGame((s) => s);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scroll.current;
    const els = root?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!root || !els?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) (e.target.classList.add('is-in'), io.unobserve(e.target));
      },
      { root, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ended]);
  if (!ended) return null;
  const w = wrapUp(state);
  const good = w.outcome === 'win' || w.outcome === 'casualties';
  const copy = COPY[w.outcome];
  const done = w.objectives.filter((o) => o.done).length;
  const extracted = !!state.exfil && exfilStage(state.exfil, state.elapsedMs) === 'done';
  const hero = good ? HERO : { ...HERO, color: RED, opacity: 0.7 };
  const overhead = good ? OVERHEAD : { ...OVERHEAD, color: RED, opacity: 0.7 };
  return (
    <div className="overlay aar" data-testid="wrapup" data-outcome={w.outcome} data-extracted={extracted || undefined}>
      <section className="wrapup" role="dialog" aria-label={`After Action Report: ${HEADLINE[w.outcome]}`} data-good={good || undefined}>
        <div className="aar-scroll" ref={scroll}>
          <header className="aar-hero">
            <Stage shot={hero} className="aar-hero-art" />
            <Brackets />
            <div className="aar-top">
              <span className="aar-brand">
                <RookGlyph className="aar-rook" />
                CASTLE HOUSE
              </span>
              <span>AFTER ACTION REPORT</span>
            </div>
            <div className="aar-hero-text">
              <p className="aar-stamp" data-testid="outcome">
                {HEADLINE[w.outcome]}
                {/* A job done can still lose money (ILI-1316). */}
                {good && w.pnl < 0 && ' · AT A LOSS'}
              </p>
              <h2 className="aar-shout">
                {copy.title}
                <em>{copy.em}</em>
              </h2>
              <p className="aar-lede">{w.reason}</p>
              <p className="aar-sign">
                {copy.sign.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </p>
            </div>
          </header>

          <dl className="aar-stats" data-reveal>
            <div>
              <dt>On the clock</dt>
              <dd>{clock(w.timeUsedMs)}</dd>
            </div>
            <div>
              <dt>Objectives</dt>
              <dd>
                {done}/{w.objectives.length}
              </dd>
            </div>
            <div>
              <dt>This mission</dt>
              <dd data-testid="pnl" data-loss={w.pnl < 0 || undefined}>
                {money(w.pnl)}
              </dd>
            </div>
            <div>
              <dt>{w.outcome === 'bankrupt' ? 'Balance at shutdown' : 'Closing balance'}</dt>
              <dd data-testid="budget" data-loss={w.budget < 0 || undefined}>
                {money(w.budget)}
              </dd>
            </div>
          </dl>

          <section className="aar-sec" data-reveal>
            <h3>Objectives</h3>
            <ul className="objectives">
              {w.objectives.map((o) => (
                <li key={o.label} data-done={o.done}>
                  <i aria-hidden>{o.done ? '✓' : '✗'}</i>
                  {o.label}
                </li>
              ))}
            </ul>
          </section>

          {/* The race (ILI-1392): time used against ALPHA's walk. */}
          <section className="aar-sec" data-reveal>
            <h3>The clock against the walk</h3>
            <RaceBar s={state} />
          </section>

          {extracted && state.exfil && (
            <figure className="aar-plate" data-reveal>
              <Stage shot={LIFT} className="aar-plate-art" />
              <Brackets />
              <figcaption data-testid="aar-exfil">
                <span>
                  {TRANSPORT.callsign} · exfil · {state.exfil.square}
                </span>
                <b>Successful extraction</b>
              </figcaption>
            </figure>
          )}

          <div className="columns">
            {(
              [
                ['With your intel', w.teamWork],
                ['New intel', w.newIntel],
              ] as const
            ).map(([title, rows]) => (
              <section className="aar-sec" key={title} data-reveal>
                <h3>{title}</h3>
                <dl className="aar-cells">
                  {rows.map((r) => {
                    const k = ratio(r.value);
                    return (
                      <div key={r.label} data-gauge={k !== null || undefined}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                        {k !== null && <Bar k={k} label={r.label} />}
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>

          <section className="aar-sec" data-reveal>
            <h3>Ledger</h3>
            <dl className="payout">
              {w.payout.map((p) => (
                <div key={p.label}>
                  <dd>{p.label}</dd>
                  <dd className="v" data-neg={p.amount < 0 || undefined}>
                    {money(p.amount)}
                  </dd>
                </div>
              ))}
              <div className="total">
                <dd>This mission</dd>
                <dd className="v" data-neg={w.pnl < 0 || undefined}>
                  {money(w.pnl)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="aar-last" data-reveal>
            <Stage shot={overhead} className="aar-last-art" />
            <div className="aar-last-text">
              <p className="aar-last-line">{copy.last}</p>
              <p className="aar-code">{copy.code}</p>
            </div>
          </section>
        </div>
        <footer className="aar-actions">
          <button className="aar-primary" onClick={intro.reboot}>
            {w.outcome === 'bankrupt' ? 'Start a new PMC' : w.outcome === 'failed' ? 'Retry mission' : 'Play again'}
          </button>
          <button onClick={introOn ? intro.home : game.exit}>Exit</button>
        </footer>
      </section>
    </div>
  );
}
