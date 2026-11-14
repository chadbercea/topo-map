import { useEffect, useRef } from 'react';
import { ABOUT, APPLY, CAPABILITIES, DIVISIONS, BRAND, FOOTER, NAV, OPEN, PAY, SELECTION, STANDARDS, type Shot } from './content';

// Castle House's recruitment site (ILI-1480), rebuilt as a mobile-first brochure (ILI-1526):
// mostly pictures, a headline and a line per section. Castle House's own website, written as if
// it were real: it recruits the visitor as a contractor. It opens on the house's own pieces (ILI-1531):
// the rook, oversized and cropped, over the globe and its satellites, under the recruiting line;
// the way in (Begin selection) waits in Apply, further down. Every section is carried
// by one of the line-drawn models, framed tight and cinematic, that turns and dollies as you
// scroll (studio.ts: one shared renderer, only on-screen stages drawn). Text rises into place as
// it scrolls in. Nothing depends on hover. The copy is all in content.ts.

const APPLY_HREF = '../'; // selection starts at Castle House's secure terminal

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

// A framed model: a box the studio draws its shot into, moved by the scroll. Three.js loads with
// the first stage near the screen.
function Stage({ shot, label, className = '' }: { shot: Shot; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let dead = false;
    let stop = () => {};
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        import('./studio')
          .then(({ stage }) => {
            if (!dead) stop = stage(host, shot);
          })
          .catch(() => {});
      },
      { rootMargin: '50% 0px' },
    );
    io.observe(host);
    return () => {
      dead = true;
      io.disconnect();
      stop();
    };
  }, [shot]);
  return <div ref={ref} className={`ch-stage ${className}`} data-testid="stage" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />;
}

// Text rises into place as it scrolls in (a class, set once; the browser animates it).
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!els?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) (e.target.classList.add('is-in'), io.unobserve(e.target));
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

export function Site() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const roles = DIVISIONS.items.reduce((n, d) => n + d.roles.length, 0);
  return (
    <div className="ch" ref={root}>
      <div className="ch-page">
        <header className="ch-nav">
          <a className="ch-brand" href="#top">
            <Rook />
            <span>{BRAND}</span>
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

        {/* The opener: the globe and its satellites as a horizon, the rook huge and cropped over it, the line, and a pointer to Apply. */}
        <section className="ch-open" id="top" data-testid="opener">
          <Stage shot={OPEN.globe} className="ch-open-globe" />
          <Stage shot={OPEN.rook} className="ch-open-rook" />
          <div className="ch-open-text">
            <p className="ch-stamp">{OPEN.stamp}</p>
            <h1 className="ch-shout">
              {OPEN.title[0]} <em>{OPEN.title[1]}</em>
            </h1>
            <p className="ch-lede">{OPEN.lede}</p>
            <dl className="ch-read">
              {[...OPEN.read, ['Postings', String(roles)]].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <a className="ch-jump" href="#apply">
              {OPEN.jump} <span aria-hidden>↓</span>
            </a>
          </div>
        </section>

        {/* Who we are: the globe and its three satellites sweeping through the frame, the statement and three numbers under it. */}
        <section className="ch-sec ch-about" id="about">
          <Stage shot={ABOUT.shot} className="ch-about-art" />
          <div className="ch-about-text">
            <p className="ch-stamp" data-reveal>
              {ABOUT.stamp}
            </p>
            <h2 className="ch-shout" data-reveal>
              {ABOUT.title[0]} <em>{ABOUT.title[1]}</em>
            </h2>
            <p className="ch-lede" data-reveal>
              {ABOUT.lede}
            </p>
            <dl className="ch-stats" aria-label="Company file">
              {ABOUT.file.map(([v, k]) => (
                <div key={k} data-reveal>
                  <dd>{v}</dd>
                  <dt>{k}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* What we do: four full-screen plates, each a model framed tight, a headline and a line. */}
        <section className="ch-caps" id="capabilities">
          <header className="ch-sec-head">
            <p className="ch-stamp" data-reveal>
              {CAPABILITIES.stamp}
            </p>
            <h2 data-reveal>{CAPABILITIES.title}</h2>
          </header>
          {CAPABILITIES.items.map((c, i) => (
            <article key={c.code} className="ch-plate" data-testid="capability">
              <Stage shot={c.shot} label={c.name} className="ch-plate-art" />
              <div className="ch-plate-text">
                <span className="ch-code" data-reveal>
                  {c.code} · {String(i + 1).padStart(2, '0')} / {String(CAPABILITIES.items.length).padStart(2, '0')} · {c.name}
                </span>
                <h3 data-reveal>{c.title}</h3>
                <p data-reveal>{c.text}</p>
                <dl className="ch-read" data-reveal>
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
        </section>

        {/* Divisions: a card each, its model on top, its postings under. Swipe on a phone. */}
        <section className="ch-sec ch-divs" id="divisions">
          <p className="ch-stamp" data-reveal>
            {DIVISIONS.stamp} · {roles} open postings
          </p>
          <h2 data-reveal>{DIVISIONS.title}</h2>
          <div className="ch-rail">
            {DIVISIONS.items.map((d) => (
              <article key={d.code} className="ch-div">
                <Stage shot={d.shot} label={d.name} className="ch-div-art" />
                <Brackets />
                <header>
                  <span className="ch-code">{d.code}</span>
                  <h3>{d.name}</h3>
                  <p>{d.text}</p>
                </header>
                <ul>
                  {d.roles.map((r) => (
                    <li key={r.code}>
                      <a href={APPLY_HREF} data-testid="posting">
                        <b>{r.title}</b>
                        <span>{r.posting}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* Selection: the compass huge behind, the one number, and the funnel's bars filling in. */}
        <section className="ch-sec ch-selection" id="selection">
          <Stage shot={SELECTION.shot} className="ch-bg-art" />
          <p className="ch-stamp" data-reveal>
            {SELECTION.stamp}
          </p>
          <h2 className="ch-big" data-reveal>
            <b>{SELECTION.big}</b>
            <span>{SELECTION.title}</span>
          </h2>
          <ol className="ch-funnel" data-reveal>
            {SELECTION.stages.map((s, i) => (
              <li key={s.title} style={{ '--i': i } as React.CSSProperties}>
                <span>{s.title}</span>
                <span className="ch-bar" aria-label={`${s.left} in 100 remain`}>
                  <s style={{ width: `${s.left}%` }} />
                </span>
              </li>
            ))}
          </ol>
          <ul className="ch-chips" aria-label="Our standards" data-reveal>
            {STANDARDS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        {/* Compensation: the day rates big, four terms, and the kit issued on day one. */}
        <section className="ch-sec ch-pay" id="compensation">
          <p className="ch-stamp" data-reveal>
            {PAY.stamp}
          </p>
          <h2 data-reveal>{PAY.title}</h2>
          <h3 className="ch-sub">{PAY.ratesTitle}</h3>
          <dl className="ch-rates">
            {DIVISIONS.items.map((d) => (
              <div key={d.code} data-reveal>
                <dt>{d.name}</dt>
                <dd>{d.rate}</dd>
              </div>
            ))}
          </dl>
          <dl className="ch-ledger" data-reveal>
            {PAY.terms.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="ch-sub">{PAY.kitTitle}</h3>
          <div className="ch-kit">
            {PAY.kit.map((k) => (
              <figure key={k.label}>
                <Stage shot={k.shot} label={k.label} />
                <Brackets />
                <figcaption>{k.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Apply: the satellite overhead, the line, the terminal, the way in. */}
        <section className="ch-sec ch-close" id="apply">
          <Stage shot={APPLY.shot} className="ch-bg-art ch-close-art" />
          <p className="ch-stamp" data-reveal>
            {APPLY.stamp}
          </p>
          <h2 className="ch-shout" data-reveal>
            {APPLY.title[0]} <em>{APPLY.title[1]}</em>
          </h2>
          <p className="ch-lede" data-reveal>
            {APPLY.lede}
          </p>
          <div className="ch-term" data-reveal>
            <Brackets />
            <ol>
              {APPLY.terminal.map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <i aria-hidden />
                  <b>{v}</b>
                </li>
              ))}
            </ol>
            <Apply />
          </div>
        </section>

        <footer className="ch-foot">
          <div className="ch-brand">
            <Rook />
            <span>{BRAND}</span>
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
