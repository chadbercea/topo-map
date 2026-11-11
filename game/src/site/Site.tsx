import { useEffect, useRef } from 'react';

// Castle House's website (ILI-1333): the fictional PMC from PMC War Room. It reads in three
// acts as you scroll. First, bland corporate (light, rounded, buzzwords). Then the shift: the
// page darkens and the copy starts to crack. Last, full war propaganda: a hard recruitment pitch
// whose every call to action launches the game, the test. All in-universe and satire: no real
// company, person, agency or programme. The last act opens on the game's own title scene, live.

const GAME = '../'; // the test is the game

// Act one: the brochure.
const SOLUTIONS: [string, string][] = [
  ['Integrated Assurance', 'End-to-end support solutions that de-risk complex environments for the partners who need it most.'],
  ['Insight Services', 'Best-in-class situational awareness, delivered through our proprietary ORION™ platform.'],
  ['Mission Continuity', 'Flexible, scalable sustainment that keeps your priorities moving, whatever the terrain.'],
];
const VALUES = ['Integrity', 'Excellence', 'Partnership', 'Accountability'];

// Act two: the cracks.
const SHIFT: [string, string][] = [
  ['Our people are our greatest asset.', 'Five of them are in the field right now.'],
  ['We value work–life balance.', 'Their work is staying alive. Their balance is you.'],
  ['We deliver results.', 'Somewhere a team is holding short of a square, waiting on a decision.'],
  ['We are a trusted partner.', 'They trust whoever is in the chair. The chair is empty.'],
];

// Act three: the pitch.
const ORDERS = ['Read the ground before they walk it.', 'Find them before they find the team.', 'Spend what it takes.', 'Bring everyone home.'];
const TRAITS = [
  'You stay calm with a lot on the screen and very little on the radio.',
  'You can decide for people you will never meet.',
  'You read a casualty as a line on a P&L, and it still bothers you. A little.',
  'You don’t need to be thanked.',
];

// The rook and the globe from the game's title, live.
function Hero3D() {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    import('../hud/castleScene').then(({ mountCastle }) => {
      if (dead || !back.current || !front.current) return;
      stop = mountCastle(back.current, front.current, () => {}, navigator.webdriver === true)?.stop;
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, []);
  return (
    <div className="ch-hero-3d" aria-hidden>
      <div ref={back} className="castle-scene" />
      <div ref={front} className="castle-scene" />
    </div>
  );
}

function Rook() {
  return (
    <svg className="ch-rook" viewBox="0 0 40 52" aria-hidden>
      <path d="M6 50h28v-4l-3-3h-2l-2-24 4-4V5h-5v4h-4V5h-4v4h-4V5H9v10l4 4-2 24H9l-3 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Enlist({ children = 'Take the test' }: { children?: string }) {
  return (
    <a className="ch-enlist" href={GAME} data-testid="apply">
      {children}
    </a>
  );
}

// The game's intro is the hero (ILI-1447): the rook and the globe, live, full screen and fixed.
// Scrolling leaves it still while the site slides up over it, a scrim darkening it as it's
// covered.
function IntroHero() {
  return (
    <div className="ch-intro" data-testid="intro-hero">
      <Hero3D />
      <div className="ch-intro-mark">
        <Rook />
        <h1>CASTLE HOUSE</h1>
        <p>Private military support · now recruiting</p>
        <Enlist>Take the test</Enlist>
        <span className="ch-intro-scroll" aria-hidden>
          Scroll ↓
        </span>
      </div>
      <div className="ch-intro-scrim" aria-hidden />
    </div>
  );
}

export function Site() {
  // How far the page has covered the hero, 0 to 1 (ILI-1447).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => root.current?.style.setProperty('--cover', String(Math.min(1, scrollY / Math.max(1, innerHeight))));
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => {
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
    };
  }, []);
  return (
    <div className="ch" ref={root}>
      <IntroHero />
      <div className="ch-page">
      {/* ACT ONE: the brochure. */}
      <div className="ch-act1">
        <header className="ch-nav">
          <a className="ch-brand" href="#top">
            <Rook />
            <span>Castle House</span>
          </a>
          <nav aria-label="Site">
            <a href="#solutions">Solutions</a>
            <a href="#about">About us</a>
            <a href="#careers">Careers</a>
          </nav>
        </header>

        <section className="ch-hero1" id="top">
          <p className="ch-kicker">Global support solutions</p>
          <h1>Delivering assurance in a complex world.</h1>
          <p className="ch-lede">Castle House partners with organisations operating in challenging environments to deliver the insight, support and continuity they need to achieve their mission.</p>
          <div className="ch-actions">
            <a className="ch-btn" href="#solutions">
              Explore our solutions
            </a>
            <a className="ch-btn ghost" href="#about">
              Our story
            </a>
          </div>
        </section>

        <section className="ch-sec1" id="solutions">
          <p className="ch-kicker">What we do</p>
          <h2>Solutions that move with you.</h2>
          <div className="ch-cards">
            {SOLUTIONS.map(([h, b]) => (
              <article key={h} className="ch-card">
                <h3>{h}</h3>
                <p>{b}</p>
                <span>Learn more →</span>
              </article>
            ))}
          </div>
        </section>

        <section className="ch-sec1 ch-about" id="about">
          <div>
            <p className="ch-kicker">About us</p>
            <h2>A partner you can trust, wherever the work takes you.</h2>
            <p>For over a decade, Castle House has helped its partners turn uncertainty into opportunity. Our people bring passion, expertise and a relentless focus on outcomes to every engagement.</p>
          </div>
          <ul className="ch-values" aria-label="Our values">
            {VALUES.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </section>
      </div>

      {/* ACT TWO: the shift. The page darkens, and the brochure starts to crack. */}
      <div className="ch-act2" id="careers">
        <section className="ch-sec2">
          <p className="ch-kicker">Careers</p>
          <h2>Join a team that makes a difference.</h2>
          <ol className="ch-cracks">
            {SHIFT.map(([said, meant]) => (
              <li key={said}>
                <span className="said">{said}</span>
                <span className="meant">{meant}</span>
              </li>
            ))}
          </ol>
          <p className="ch-turn">We&rsquo;re not hiring for a role.</p>
          <p className="ch-turn hard">We&rsquo;re hiring for a seat.</p>
        </section>
      </div>

      {/* ACT THREE: the pitch. */}
      <div className="ch-act3">
        <section className="ch-hero3" id="enlist">
          {/* The live rook and globe are the page's hero now (ILI-1447); one scene, not two. */}
          <div className="ch-hero3-copy">
            <p className="ch-stamp">Castle House needs you</p>
            <h2 className="ch-shout">
              The team is moving.
              <br />
              The chair is <em>empty.</em>
            </h2>
            <p className="ch-lede3">You won&rsquo;t fire a shot. You&rsquo;ll decide who does.</p>
            <Enlist />
          </div>
        </section>

        <section className="ch-sec3">
          <p className="ch-stamp">Your orders</p>
          <ol className="ch-orders">
            {ORDERS.map((o, i) => (
              <li key={o}>
                <i>0{i + 1}</i>
                {o}
              </li>
            ))}
          </ol>
        </section>

        <section className="ch-sec3 ch-test">
          <p className="ch-stamp">Do you have what it takes?</p>
          <ul className="ch-traits">
            {TRAITS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="ch-lede3">Most who sit in the chair don&rsquo;t last one contract. One live contract. Ten minutes on the clock. Five operators who will do exactly what you make possible.</p>
          <Enlist>Prove it</Enlist>
        </section>

        <section className="ch-sec3 ch-final">
          <Rook />
          <h2 className="ch-shout">They&rsquo;re already on the ground.</h2>
          <p className="ch-lede3">Sit down. The clock starts when you do.</p>
          <Enlist>Take your seat</Enlist>
          <p className="ch-fine">Castle House is an equal-liability employer. Performance is monitored at all times. Candidates who bankrupt the company will not be invited back.</p>
        </section>

        <footer className="ch-foot">
          <div className="ch-brand">
            <Rook />
            <span>CASTLE HOUSE</span>
          </div>
          <p className="ch-fiction">
            Castle House is a fictional company from <a href={GAME}>PMC War Room</a>, a browser game by Chad Bercea. This is satire: nothing on this page describes a real company, person, job or service. <a href="../design/">Design system</a>
          </p>
        </footer>
      </div>
      </div>
    </div>
  );
}
