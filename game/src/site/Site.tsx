import { useEffect, useRef } from 'react';

// Castle House's recruitment site (ILI-1455): the fictional PMC from PMC War Room is hiring, and
// the game is the recruitment test. Under the hero (the game's intro, ILI-1447) it reads as a
// slick, cold careers site: open roles, the package, the test, what people say, the FAQ. Every
// call to action is "take the test". All in-universe and satire: no real company, person,
// agency, programme, job or service.

const GAME = '../'; // the test is the game

const ROLES: { code: string; title: string; where: string; pitch: string; need: string[] }[] = [
  {
    code: 'ROA-01',
    title: 'Remote Operations Analyst',
    where: 'Remote · any time zone · the chair',
    pitch: 'Sit in the chair. Watch a five-man team walk into ground nobody has looked at, and decide what they see before they see it.',
    need: ['Calm with a lot on the screen and very little on the radio', 'Decides for people you will never meet', 'No military experience required. Or wanted.'],
  },
  {
    code: 'ISR-07',
    title: 'Imagery Analyst, ORION™',
    where: 'Remote · 400 km up',
    pitch: 'Point a satellite at a square of desert and say what is in it. Scan, photo, video. Be right.',
    need: ['Can tell a goat from a technical at 30 cm', 'Comfortable being the only eyes', 'Owns their mistakes. Somebody has to.'],
  },
  {
    code: 'SIG-12',
    title: 'Signals Intercept Specialist',
    where: 'Remote · 30–88 MHz',
    pitch: 'Find their net, listen in, decode the plan, send it forward. Their radios carry further than they think.',
    need: ['A steady hand on a dial', 'Patience with static', 'Discretion. Total.'],
  },
];

const PACKAGE: [string, string][] = [
  ['Fully remote', 'Command from your kitchen. The team is the one in the field.'],
  ['Results-based pay', 'Contract money out of escrow when the job is done. Losses come out of the same pot.'],
  ['Unlimited intel', 'As much as you can scan. ALPHA walks as far as you feed it.'],
  ['Career growth', 'Start with one team. There is only one team.'],
  ['Wellness', 'A medic in every squad. Not yours. Theirs.'],
  ['Flexible hours', 'Ten minutes. The client sets the clock; you keep it.'],
];

const TEST: [string, string][] = [
  ['01', 'One team, one objective: ALPHA, five operators, a downed drone, its black box.'],
  ['02', 'One satellite: ORION-3. Move it, scan, send what you find. ALPHA only moves on your intel.'],
  ['03', 'Ten minutes on the client’s clock. Bring the box out. Bring everyone home.'],
];

const QUOTES: [string, string][] = [
  ['I used to manage a regional logistics desk. Now I manage a regional logistics desk with consequences.', 'OVERWATCH-4 · Analyst, 2 contracts'],
  ['The onboarding was ten minutes. I still think about minute seven.', 'KESTREL-2 · Imagery'],
  ['They said the culture was flat. It is. The chain of command is me and the team.', 'LONGWAVE-9 · Signals'],
];

const FAQ: [string, string][] = [
  ['Is this a real job?', 'No. Castle House is a fictional company from PMC War Room, a browser game. Nothing here describes a real company, person, job or service.'],
  ['Do I need experience?', 'No. The test teaches you as you go. That is rather the point.'],
  ['How long does the test take?', 'Ten minutes on the mission clock. Longer if you read the brief twice. Read the brief twice.'],
  ['What is scored?', 'Whether the black box comes out, whether the team does, how much intel you got them, and what it all cost.'],
  ['What happens if I fail?', 'You take it again. In the field there is no "again". Here there is.'],
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
        <header className="ch-nav">
          <a className="ch-brand" href="#top">
            <Rook />
            <span>CASTLE HOUSE</span>
          </a>
          <nav aria-label="Site">
            <a href="#roles">Open roles</a>
            <a href="#package">Package</a>
            <a href="#test">The test</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Enlist>Apply</Enlist>
        </header>

        <section className="ch-lead" id="top">
          <p className="ch-stamp">Recruiting now · remote</p>
          <h2 className="ch-shout">
            The team is moving.
            <br />
            The chair is <em>empty.</em>
          </h2>
          <p className="ch-lede">You won&rsquo;t fire a shot. You&rsquo;ll decide who does. Castle House is hiring remote operations staff to run intelligence for a team in the field. The interview is a live operation.</p>
        </section>

        <section className="ch-sec" id="roles">
          <p className="ch-stamp">Open roles · 3</p>
          <h2>Positions available.</h2>
          <div className="ch-roles">
            {ROLES.map((r) => (
              <article key={r.code} className="ch-role">
                <header>
                  <span className="ch-code">{r.code}</span>
                  <span className="ch-where">{r.where}</span>
                </header>
                <h3>{r.title}</h3>
                <p>{r.pitch}</p>
                <ul>
                  {r.need.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <a className="ch-role-apply" href={GAME}>
                  Apply: take the test →
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="ch-sec" id="package">
          <p className="ch-stamp">The package</p>
          <h2>Competitive. Considering.</h2>
          <dl className="ch-package">
            {PACKAGE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="ch-sec ch-test" id="test">
          <p className="ch-stamp">The recruitment test</p>
          <h2>Every applicant runs a live operation.</h2>
          <ol className="ch-steps">
            {TEST.map(([n, t]) => (
              <li key={n}>
                <i>{n}</i>
                {t}
              </li>
            ))}
          </ol>
          <Enlist>Start the test</Enlist>
        </section>

        <section className="ch-sec" id="voices">
          <p className="ch-stamp">From the chair</p>
          <div className="ch-quotes">
            {QUOTES.map(([q, who]) => (
              <figure key={who}>
                <blockquote>&ldquo;{q}&rdquo;</blockquote>
                <figcaption>{who}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="ch-sec" id="faq">
          <p className="ch-stamp">Questions</p>
          <div className="ch-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ch-close">
          <h2 className="ch-shout">
            Five operators. One satellite.
            <br />
            <em>Ten minutes.</em>
          </h2>
          <Enlist>Take the test</Enlist>
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
  );
}
