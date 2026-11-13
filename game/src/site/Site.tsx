import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WireAvatar } from '../hud/OrionAvatar';
import { ABOUT, APPLY, CAPABILITIES, DIVISIONS, FOOTER, HERO, NAV, PAY, SELECTION, STANDARDS, type SceneKey } from './content';

// Castle House's recruitment site, rebuilt (ILI-1480). Castle House's own website, written as if
// it were real: it recruits the visitor as a contractor. The hero is the war room's title screen
// (the sharp rook, the globe and satellites blurred behind, the name and a row of terminal
// options at the foot). Below it, six sections, each its own layout: a dossier, a capability
// console, a division board, a selection funnel, a pay ledger with the issued kit, and a terminal
// close. The copy is all in content.ts. Every wireframe mounts only once it's near the screen.

const APPLY_HREF = '../'; // selection starts at Castle House's secure terminal

type Load = () => Promise<{ mount: (...a: never[]) => unknown }>;
const SCENES: Record<SceneKey, Load> = {
  satellite: () => import('../hud/orionScene'),
  uav: () => import('../hud/droneScene'),
  rotary: () => import('../hud/heliScene'),
  airlift: () => import('../hud/transportScene'),
  rifle: () => import('../hud/m4Scene'),
  medical: () => import('../hud/ifakScene'),
  comms: () => import('../hud/terminalScene'),
  nav: () => import('../hud/mapScene'),
};

// The rook and the globe, live: the title screen's two canvases (castleScene).
function Hero3D() {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const [flat, setFlat] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    import('../hud/castleScene').then(({ mountCastle }) => {
      if (dead || !back.current || !front.current) return;
      const castle = mountCastle(back.current, front.current, () => {}, navigator.webdriver === true);
      if (!castle) setFlat(true);
      stop = castle?.stop;
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, []);
  return (
    <div className="ch-hero-3d" aria-hidden>
      <div ref={back} className="castle-scene ch-hero-back" />
      <div ref={front} className="castle-scene ch-hero-front" />
      {flat && <Rook className="ch-rook ch-hero-flat" />}
    </div>
  );
}

function Rook({ className = 'ch-rook' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 52" aria-hidden>
      <path d="M6 50h28v-4l-3-3h-2l-2-24 4-4V5h-5v4h-4V5h-4v4h-4V5H9v10l4 4-2 24H9l-3 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Apply({ children = APPLY.cta, className = 'ch-enlist' }: { children?: string; className?: string }) {
  return (
    <a className={className} href={APPLY_HREF} data-testid="apply">
      {children}
    </a>
  );
}

function Brackets() {
  return (
    <>
      <i className="ch-br tl" />
      <i className="ch-br tr" />
      <i className="ch-br bl" />
      <i className="ch-br br" />
    </>
  );
}

// Mounts its children once it's near the screen: a page of WebGL at once is heavy.
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

// A live wireframe from the design system, in its bracketed frame.
function Wire({ scene, state, label, className = '' }: { scene: SceneKey; state: string; label: string; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={`ch-wire ${className}`} data-testid="wire" role="img" aria-label={label}>
      {seen && <WireAvatar key={scene} state={state} fallback={<span className="ch-wire-wait" />} load={SCENES[scene] as never} className="ch-wire-3d" />}
      <Brackets />
    </div>
  );
}

function Stamp({ children }: { children: ReactNode }) {
  return <p className="ch-stamp">{children}</p>;
}

// HUD readouts: a small label over a value.
function Readouts({ items, className = 'ch-read' }: { items: [string, string][]; className?: string }) {
  return (
    <dl className={className}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// The ground the map draws, as a backdrop: faint contours and the grid.
function Contours() {
  const rings = [
    [22, 40, 1], [24, 42, 0.8], [62, 58, 1.2], [64, 60, 1], [80, 30, 0.9], [44, 72, 0.7],
  ];
  return (
    <svg className="ch-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id="ch-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="rgba(53,208,165,0.14)" strokeWidth="0.15" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#ch-grid)" />
      {rings.map(([x, y, s], i) =>
        [0, 1, 2, 3].map((k) => <ellipse key={`${i}-${k}`} cx={x} cy={y} rx={(5 + k * 4) * s} ry={(3 + k * 2.6) * s} fill="none" stroke="rgba(53,208,165,0.12)" strokeWidth="0.15" />),
      )}
    </svg>
  );
}

// The hero: the title screen. The rook sharp, the globe blurred behind, the name and a row of
// terminal options at the foot. Fixed; the page slides up over it.
function Hero() {
  return (
    <div className="ch-intro" data-testid="intro-hero">
      <Hero3D />
      <div className="ch-intro-mark">
        <h1>{HERO.name}</h1>
        <p>{HERO.line}</p>
        <nav className="ch-menu" aria-label="Castle House">
          <Apply className="ch-menu-go" />
          <a href="#divisions">Divisions</a>
          <a href="#compensation">Compensation</a>
        </nav>
        <p className="ch-status">
          {HERO.status}
          <span className="ch-caret" aria-hidden>
            ▌
          </span>
        </p>
      </div>
      <div className="ch-intro-scrim" aria-hidden />
    </div>
  );
}

// What we do: a console. Pick a capability on the left; its wireframe and spec sheet fill the
// screen on the right. One scene at a time.
function Capabilities() {
  const [at, setAt] = useState(0);
  const c = CAPABILITIES.items[at];
  return (
    <section className="ch-sec ch-caps" id="capabilities">
      <Stamp>{CAPABILITIES.stamp}</Stamp>
      <h2>{CAPABILITIES.title}</h2>
      <div className="ch-console">
        <div className="ch-tabs" role="tablist" aria-label={CAPABILITIES.stamp}>
          {CAPABILITIES.items.map((x, i) => (
            <button key={x.code} role="tab" aria-selected={i === at} onClick={() => setAt(i)} data-testid="capability">
              <span className="ch-code">{x.code}</span>
              <b>{x.title}</b>
            </button>
          ))}
        </div>
        <article className="ch-spec" role="tabpanel" aria-label={c.title}>
          <Wire scene={c.scene} state={c.state} label={c.title} className="ch-spec-wire" />
          <div className="ch-spec-body">
            <span className="ch-code">
              {c.code} · {String(at + 1).padStart(2, '0')} / {String(CAPABILITIES.items.length).padStart(2, '0')}
            </span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <ul>
              {c.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Readouts items={c.read} />
          </div>
        </article>
      </div>
    </section>
  );
}

export function Site() {
  // How far the page has covered the hero, 0 to 1.
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
  const roles = DIVISIONS.items.reduce((n, d) => n + d.roles.length, 0);
  return (
    <div className="ch" ref={root}>
      <Hero />
      <div className="ch-page">
        <header className="ch-nav">
          <a className="ch-brand" href="#about">
            <Rook />
            <span>{HERO.name}</span>
          </a>
          <nav aria-label="Site">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <Apply className="ch-enlist ch-small">Apply</Apply>
        </header>

        {/* Who we are: the statement beside the company file. */}
        <section className="ch-sec ch-about" id="about">
          <Contours />
          <div className="ch-about-text">
            <Stamp>{ABOUT.stamp}</Stamp>
            <h2 className="ch-shout">
              {ABOUT.title[0]}
              <br />
              <em>{ABOUT.title[1]}</em>
            </h2>
            <p className="ch-lede">{ABOUT.lede}</p>
            <p className="ch-lede ch-lede-ink">{ABOUT.body}</p>
          </div>
          <aside className="ch-file" aria-label="Company file">
            <Brackets />
            <header>
              <Rook />
              <span>Company file</span>
            </header>
            <Readouts items={ABOUT.file} className="ch-file-list" />
          </aside>
        </section>

        <Capabilities />

        {/* Divisions and roles: four columns, each a division's board. */}
        <section className="ch-sec ch-divs" id="divisions">
          <Stamp>
            {DIVISIONS.stamp} · {roles} open postings
          </Stamp>
          <h2>{DIVISIONS.title}</h2>
          <div className="ch-div-grid">
            {DIVISIONS.items.map((d) => (
              <article key={d.code} className="ch-div">
                <header>
                  <span className="ch-code">{d.code}</span>
                  <h3>{d.name}</h3>
                  <p>{d.text}</p>
                </header>
                <ul>
                  {d.roles.map((r) => (
                    <li key={r.code}>
                      <a href={APPLY_HREF} data-testid="posting">
                        <span className="ch-code">{r.code}</span>
                        <b>{r.title}</b>
                        <span className="ch-post-meta">{r.posting}</span>
                        <span className="ch-post-need">{r.need}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* Standards and selection: the code, then the funnel with how many are left at each stage. */}
        <section className="ch-sec ch-selection" id="selection">
          <Stamp>{SELECTION.stamp}</Stamp>
          <div className="ch-sel">
            <div className="ch-std">
              <h3>{SELECTION.standardsTitle}</h3>
              <ol>
                {STANDARDS.map(([t, d], i) => (
                  <li key={t}>
                    <i>{String(i + 1).padStart(2, '0')}</i>
                    <div>
                      <b>{t}</b>
                      <p>{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="ch-funnel">
              <h2>{SELECTION.title}</h2>
              <ol>
                {SELECTION.stages.map((s, i) => (
                  <li key={s.title}>
                    <i>{String(i + 1).padStart(2, '0')}</i>
                    <div>
                      <b>{s.title}</b>
                      <p>{s.text}</p>
                    </div>
                    <span className="ch-bar" aria-label={`${s.left} in 100 remain`}>
                      <s style={{ width: `${s.left}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Compensation: the pay ledger, then the kit every contractor is issued. */}
        <section className="ch-sec ch-pay" id="compensation">
          <Stamp>{PAY.stamp}</Stamp>
          <h2>{PAY.title}</h2>
          <div className="ch-pay-split">
            <div>
              <h3 className="ch-sub">{PAY.ratesTitle}</h3>
              <dl className="ch-rates">
                {DIVISIONS.items.map((d) => (
                  <div key={d.code}>
                    <dt>{d.name}</dt>
                    <dd>{d.rate}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <dl className="ch-ledger">
              {PAY.terms.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <i aria-hidden />
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <h3 className="ch-sub">{PAY.kitTitle}</h3>
          <div className="ch-kit">
            {PAY.kit.map((k) => (
              <figure key={k.label}>
                <Wire scene={k.scene} state={k.state} label={k.label} />
                <figcaption>{k.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Apply: the selection terminal, the way in. */}
        <section className="ch-sec ch-close" id="apply">
          <Contours />
          <div className="ch-close-text">
            <Stamp>{APPLY.stamp}</Stamp>
            <h2 className="ch-shout">
              {APPLY.title[0]}
              <br />
              <em>{APPLY.title[1]}</em>
            </h2>
            <p className="ch-lede">{APPLY.lede}</p>
          </div>
          <div className="ch-term">
            <Brackets />
            <Rook />
            <ol>
              {APPLY.terminal.map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  {v && (
                    <>
                      <i aria-hidden />
                      <b>{v}</b>
                    </>
                  )}
                </li>
              ))}
            </ol>
            <Apply />
          </div>
        </section>

        <footer className="ch-foot">
          <div className="ch-brand">
            <Rook />
            <span>{HERO.name}</span>
          </div>
          <nav aria-label="Footer">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <p className="ch-legal">{FOOTER}</p>
        </footer>
      </div>
    </div>
  );
}
