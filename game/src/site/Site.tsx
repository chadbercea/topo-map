import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WireAvatar } from '../hud/OrionAvatar';

// Castle House's recruitment site (ILI-1336): Castle House's own website, written as if it were
// real. It does one thing: it builds Castle House up as the leading private military company and
// recruits the visitor as a contractor. No game talk, no fourth-wall breaks, nothing from any one
// mission. The type is the war room's; the visuals are its design system: the edges-only teal
// wireframes, map contours and grid, corner brackets, HUD readouts. Every scene loads on view.

const APPLY = '../'; // selection starts at Castle House's secure terminal

type Load = () => Promise<{ mount: (...a: never[]) => unknown }>;
const scene = {
  satellite: () => import('../hud/orionScene'),
  uav: () => import('../hud/droneScene'),
  rotary: () => import('../hud/heliScene'),
  airlift: () => import('../hud/transportScene'),
  rifle: () => import('../hud/m4Scene'),
  marksman: () => import('../hud/rifleScene'),
  medical: () => import('../hud/ifakScene'),
  comms: () => import('../hud/terminalScene'),
  nav: () => import('../hud/mapScene'),
} satisfies Record<string, Load>;

const STATS: [string, string][] = [
  ['17', 'years in operation'],
  ['2,400+', 'contractors under contract'],
  ['6', 'theatres on three continents'],
  ['0', 'clients abandoned in the field'],
];

const CAPABILITIES: { code: string; title: string; text: string; load: Load; state: string; read: [string, string][] }[] = [
  { code: 'ISR', title: 'Intelligence, surveillance, reconnaissance', text: 'Our own imaging constellation and analysts on every operation. Our teams never move on guesswork.', load: scene.satellite, state: 'idle', read: [['Coverage', '24 / 7'], ['Revisit', '< 40 min']] },
  { code: 'AIR', title: 'Precision air support', text: 'Armed UAVs and rotary-wing crews on call, cleared and tasked by our own operations centre.', load: scene.uav, state: 'inbound', read: [['On call', 'Every op'], ['Response', '< 12 min']] },
  { code: 'MOB', title: 'Air mobility and extraction', text: 'Insertion, resupply and extraction by tactical airlift. Nobody is left where we put them.', load: scene.airlift, state: 'enroute', read: [['Lift', 'Day / night'], ['Range', '900 km']] },
  { code: 'GND', title: 'Ground teams', text: 'Five-person teams, selected, trained and equipped to one standard, anywhere a client needs presence.', load: scene.rifle, state: 'on', read: [['Team', '5'], ['Readiness', '72 h']] },
];

const ROLES: { code: string; title: string; division: string; base: string; need: string }[] = [
  { code: 'GT-110', title: 'Field Operator', division: 'Ground Teams', base: 'Rotational · 8 / 8', need: 'Prior service or equivalent. Pass selection.' },
  { code: 'GT-140', title: 'Team Medic', division: 'Ground Teams', base: 'Rotational · 8 / 8', need: 'Paramedic or combat medical qualification.' },
  { code: 'GT-160', title: 'Designated Marksman', division: 'Ground Teams', base: 'Rotational · 8 / 8', need: 'Documented long-range qualification.' },
  { code: 'IS-210', title: 'Imagery Analyst', division: 'ISR', base: 'Operations centre', need: 'Satellite or airborne imagery experience.' },
  { code: 'IS-230', title: 'Signals Specialist', division: 'ISR', base: 'Operations centre', need: 'Intercept, direction-finding or EW background.' },
  { code: 'AS-310', title: 'UAV Pilot', division: 'Air Support', base: 'Forward base', need: 'Rated on medium-altitude platforms.' },
  { code: 'AS-330', title: 'Rotary-Wing Crew', division: 'Air Support', base: 'Forward base', need: 'Pilot or crew chief, NVG current.' },
  { code: 'OC-410', title: 'Operations Controller', division: 'Operations Centre', base: 'Remote · secure site', need: 'Runs teams, assets and intel from the chair.' },
];

const STANDARDS: [string, string, string][] = [
  ['01', 'Discretion', 'We do not discuss clients, contracts or places. Neither will you.'],
  ['02', 'Intelligence first', 'Nobody moves into ground nobody has looked at.'],
  ['03', 'One standard', 'Every team is selected, trained and equipped the same way. No exceptions for anyone.'],
  ['04', 'Accountability', 'Every decision is logged, reviewed and owned by the person who made it.'],
  ['05', 'Nobody left', 'We plan the way out before we plan the way in.'],
];

const SELECTION: [string, string, string][] = [
  ['01', 'Application', 'Service record, references, a short statement. Reviewed within 72 hours.'],
  ['02', 'Screening', 'Background, medical and psychological screening. Conducted in confidence.'],
  ['03', 'Assessment', 'Ten days. Physical, technical and decision-making under pressure.'],
  ['04', 'Contract', 'Terms, rotation and division agreed in writing. Kit issued.'],
  ['05', 'First posting', 'Integration with your team, then your first rotation.'],
];

const PAY: [string, string, string][] = [
  ['Day rate from', '$650', 'Rising with division, role and theatre.'],
  ['Rotation', '8 / 8', 'Eight weeks on, eight weeks home. Travel paid both ways.'],
  ['Cover', 'Full', 'Medical, evacuation and life cover from your first day.'],
  ['Kit', 'Issued', 'Every operator equipped to one standard. Nothing bought out of pocket.'],
];

const THEATRES: { code: string; x: number; y: number; label: string }[] = [
  { code: 'T1', x: 18, y: 38, label: 'Western' },
  { code: 'T2', x: 34, y: 62, label: 'Coastal' },
  { code: 'T3', x: 49, y: 30, label: 'Northern' },
  { code: 'T4', x: 58, y: 55, label: 'Central' },
  { code: 'T5', x: 73, y: 41, label: 'Gulf' },
  { code: 'T6', x: 84, y: 68, label: 'Southern' },
];

// The rook and the globe, live: the hero (ILI-1447).
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

function Apply({ children = 'Begin selection', quiet = false }: { children?: string; quiet?: boolean }) {
  return (
    <a className={quiet ? 'ch-enlist ch-quiet' : 'ch-enlist'} href={APPLY} data-testid="apply">
      {children}
    </a>
  );
}

// A live wireframe, mounted only once it's near the screen: a page of WebGL at once is heavy.
function Wire({ load, state, label }: { load: Load; state: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="ch-wire" data-testid="wire" role="img" aria-label={label}>
      {seen && <WireAvatar state={state} fallback={<span className="ch-wire-wait" />} load={load as never} className="ch-wire-3d" />}
      <i className="ch-br tl" /><i className="ch-br tr" /><i className="ch-br bl" /><i className="ch-br br" />
    </div>
  );
}

function Stamp({ children }: { children: ReactNode }) {
  return <p className="ch-stamp">{children}</p>;
}

// The ground the map draws, as a backdrop: faint contours and the grid.
function Contours({ className }: { className: string }) {
  const rings = [
    [22, 40, 1], [24, 42, 0.8], [62, 58, 1.2], [64, 60, 1], [80, 30, 0.9], [44, 72, 0.7],
  ];
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id="ch-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="rgba(53,208,165,0.16)" strokeWidth="0.15" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#ch-grid)" />
      {rings.map(([x, y, s], i) =>
        [0, 1, 2, 3].map((k) => <ellipse key={`${i}-${k}`} cx={x} cy={y} rx={(5 + k * 4) * s} ry={(3 + k * 2.6) * s} fill="none" stroke="rgba(53,208,165,0.13)" strokeWidth="0.15" />),
      )}
    </svg>
  );
}

// The hero (ILI-1447): the rook and the globe, fixed, full screen; the page slides up over it.
function IntroHero() {
  return (
    <div className="ch-intro" data-testid="intro-hero">
      <Hero3D />
      <div className="ch-intro-mark">
        <Rook />
        <h1>CASTLE HOUSE</h1>
        <p>Private military support · now recruiting</p>
        <Apply />
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
          <a className="ch-brand" href="#about">
            <Rook />
            <span>CASTLE HOUSE</span>
          </a>
          <nav aria-label="Site">
            <a href="#capabilities">Capabilities</a>
            <a href="#divisions">Divisions</a>
            <a href="#standards">Standards</a>
            <a href="#selection">Selection</a>
            <a href="#compensation">Compensation</a>
          </nav>
          <Apply>Apply</Apply>
        </header>

        {/* Who we are: a split, the statement and the numbers. */}
        <section className="ch-about" id="about">
          <Contours className="ch-bg" />
          <div className="ch-about-text">
            <Stamp>Who we are</Stamp>
            <h2 className="ch-shout">
              Disciplined people,
              <br />
              <em>where clients cannot go.</em>
            </h2>
            <p className="ch-lede">Castle House is a private military support company. For seventeen years we have put selected, equipped and accountable teams on the ground for governments, agencies and firms that need presence without exposure. We are recruiting.</p>
          </div>
          <dl className="ch-stats">
            {STATS.map(([v, k]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Capabilities: spec sheets, each with its wireframe and readouts. */}
        <section className="ch-sec ch-caps" id="capabilities">
          <Stamp>Capabilities</Stamp>
          <h2>Everything a team needs, owned and run by us.</h2>
          <div className="ch-cap-grid">
            {CAPABILITIES.map((c) => (
              <article key={c.code} className="ch-cap">
                <Wire load={c.load} state={c.state} label={c.title} />
                <div className="ch-cap-body">
                  <span className="ch-code">{c.code}</span>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <dl className="ch-read">
                    {c.read.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Divisions and roles: a postings board. */}
        <section className="ch-sec ch-board" id="divisions">
          <Stamp>Divisions · open postings {ROLES.length}</Stamp>
          <h2>Four divisions. One standard.</h2>
          <div className="ch-postings" role="table" aria-label="Open postings">
            <div className="ch-post ch-post-head" role="row">
              <span role="columnheader">Code</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Division</span>
              <span role="columnheader">Posting</span>
              <span role="columnheader">Requirement</span>
            </div>
            {ROLES.map((r) => (
              <a key={r.code} className="ch-post" role="row" href={APPLY} data-testid="posting">
                <span role="cell" className="ch-code">{r.code}</span>
                <span role="cell" className="ch-post-title">{r.title}</span>
                <span role="cell">{r.division}</span>
                <span role="cell">{r.base}</span>
                <span role="cell" className="ch-post-need">{r.need}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Standards: a split, the kit on one side, the code on the other. */}
        <section className="ch-sec ch-standards" id="standards">
          <div className="ch-std-kit">
            <Wire load={scene.medical} state="on" label="Issued medical kit" />
            <Wire load={scene.nav} state="on" label="Issued navigation kit" />
          </div>
          <div>
            <Stamp>Standards</Stamp>
            <h2>What we hold every contractor to.</h2>
            <ol className="ch-std-list">
              {STANDARDS.map(([n, t, d]) => (
                <li key={n}>
                  <i>{n}</i>
                  <div>
                    <b>{t}</b>
                    <p>{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Selection: a timeline, left to right. */}
        <section className="ch-sec ch-selection" id="selection">
          <Stamp>Selection</Stamp>
          <h2>Five stages. Most applicants stop at three.</h2>
          <ol className="ch-pipe">
            {SELECTION.map(([n, t, d]) => (
              <li key={n}>
                <i>{n}</i>
                <b>{t}</b>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Global reach: the map band. */}
        <section className="ch-reach" id="reach">
          <div className="ch-reach-head">
            <Stamp>Global reach</Stamp>
            <h2>Six theatres. One operations centre.</h2>
            <dl className="ch-read wide">
              <div><dt>Theatres</dt><dd>6</dd></div>
              <div><dt>Forward bases</dt><dd>14</dd></div>
              <div><dt>Deploy</dt><dd>&lt; 72 h</dd></div>
            </dl>
          </div>
          <div className="ch-map" aria-label="Castle House theatres">
            <Contours className="ch-bg" />
            <i className="ch-br tl" /><i className="ch-br tr" /><i className="ch-br bl" /><i className="ch-br br" />
            {THEATRES.map((t) => (
              <span key={t.code} className="ch-pin" style={{ left: `${t.x}%`, top: `${t.y}%` }}>
                <i className="ch-br tl" /><i className="ch-br tr" /><i className="ch-br bl" /><i className="ch-br br" />
                <em>{t.code} · {t.label}</em>
              </span>
            ))}
          </div>
        </section>

        {/* Compensation: big numbers. */}
        <section className="ch-sec ch-pay" id="compensation">
          <Stamp>Compensation</Stamp>
          <h2>Paid like it matters. Because it does.</h2>
          <dl className="ch-pay-grid">
            {PAY.map(([k, v, d]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <b>{v}</b>
                  <span>{d}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Apply. */}
        <section className="ch-close" id="apply">
          <div className="ch-close-wire">
            <Wire load={scene.rotary} state="inbound" label="Rotary-wing support" />
          </div>
          <div>
            <Stamp>Apply</Stamp>
            <h2 className="ch-shout">
              Your next posting is classified.
              <br />
              <em>Your contract isn&rsquo;t.</em>
            </h2>
            <p className="ch-lede">Selection begins at our secure terminal. Applications are reviewed within 72 hours, in confidence.</p>
            <Apply />
          </div>
        </section>

        <footer className="ch-foot">
          <div className="ch-brand">
            <Rook />
            <span>CASTLE HOUSE</span>
          </div>
          <nav aria-label="Footer">
            <a href="#about">Who we are</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#divisions">Divisions</a>
            <a href="#selection">Selection</a>
          </nav>
          <p className="ch-legal">© Castle House Group. All postings are subject to screening. Castle House does not discuss clients, contracts or locations.</p>
        </footer>
      </div>
    </div>
  );
}
