import { useCallback, useEffect, useRef, useState } from 'react';
import type { Castle, Spots } from './castleScene'; // types only: the scene loads lazily
import { intro, LINE_MS, LOGIN_LINES, useIntro, WIPE_MS, type Stage } from './intro';
import { MapViews } from './MapViews';
import { OrionFeed } from './OrionFeed';
import { game, useGame } from '../sim/store';

// The way in (ILI-1280): Castle House's idle terminal, the wipe, the login, and the link with
// ALPHA. The HUD's own panels power on between the login and the link (Hud.tsx, styles.css).

export function Intro() {
  const stage = useIntro();
  if (stage === 'live') return null;
  return (
    <div className="intro" data-stage={stage} data-testid="intro" style={{ '--wipe': `${WIPE_MS}ms` } as React.CSSProperties}>
      {(stage === 'wipe' || stage === 'login' || stage === 'panels') && <Login running={stage !== 'wipe'} leaving={stage === 'panels'} />}
      {(stage === 'title' || stage === 'idle' || stage === 'wipe') && <Terminal stage={stage} />}
      {stage === 'link' && (
        <div className="panel intro-link" data-testid="intro-link" role="status">
          <h2>ORION-3 ⇄ ALPHA</h2>
          <p>SATCOM link established</p>
        </div>
      )}
    </div>
  );
}

const LOGO_OUT_MS = 360;

// Castle House at rest (ILI-1283). The title screen first (ILI-1290): the rook and the name
// with START, ABOUT and SETTINGS, the globe and satellites blurred behind. START folds the
// logo away, the globe comes into focus and the camera flies in on ORION-3, pinging to be picked.
function Terminal({ stage }: { stage: Exclude<Stage, 'login' | 'panels' | 'link' | 'live'> }) {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const castle = useRef<Castle | null>(null);
  const [spots, setSpots] = useState<Spots | null>(null);
  const [flat, setFlat] = useState(false); // no WebGL: a still mark, and ORION-3 at a fixed spot
  const [sheet, setSheet] = useState<'about' | 'settings' | null>(null);
  const wiping = stage === 'wipe';
  const title = stage === 'title';
  const closeSheet = useCallback(() => setSheet(null), []);
  // START: the logo powers off (a beat, styles.css) while the camera flies in.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let gone = false;
    import('./castleScene').then(({ mountCastle }) => {
      if (gone || !back.current || !front.current) return;
      castle.current = mountCastle(back.current, front.current, setSpots, navigator.webdriver === true);
      if (!castle.current) setFlat(true);
      else if (intro.get() !== 'title') castle.current.focus();
    });
    return () => {
      gone = true;
      castle.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (title) return;
    castle.current?.focus();
    setLeaving(true);
    const t = setTimeout(() => setLeaving(false), LOGO_OUT_MS);
    return () => clearTimeout(t);
  }, [title]);

  const at = flat ? { x: innerWidth * 0.72, y: innerHeight * 0.3, visible: true } : spots?.orion;
  return (
    <div className="castle" data-stage={stage} data-wiping={wiping || undefined}>
      <div ref={back} className="castle-scene castle-back" />
      <div ref={front} className="castle-scene castle-front" />
      {flat && (title || leaving) && <RookMark />}
      {(title || leaving) && (
        <div className="castle-mark" data-leaving={leaving || undefined} hidden={!!sheet}>
          <h1>CASTLE HOUSE</h1>
          <p>Private military support · secure terminal</p>
          <TitleMenu open={setSheet} hidden={!!sheet || leaving} />
          <p className="castle-status">
            STANDBY · awaiting uplink<span className="caret">▌</span>
          </p>
        </div>
      )}
      {title && sheet && <Sheet which={sheet} close={closeSheet} />}
      {!title && <OrionFeed />}
      {!title && at && (
        <button
          className="castle-orion"
          style={{ left: at.x, top: at.y }}
          data-side={innerWidth < 480 ? 'below' : at.x > innerWidth * 0.6 ? 'left' : undefined}
          hidden={!at.visible}
          disabled={wiping}
          onClick={intro.engage}
          data-testid="intro-orion"
          aria-label="ORION-3, uplink ready: log in"
        >
          <span className="castle-ping" aria-hidden />
          <span className="castle-label">ORION-3 · uplink ready</span>
        </button>
      )}
      {/* The rest of the constellation: not in service yet. */}
      {!wiping &&
        !sheet &&
        spots?.others.map((o, i) => (
          <button key={i} className="castle-sat" style={{ left: o.x, top: o.y }} hidden={!o.visible} data-testid="intro-sat" aria-label="Coming soon">
            <span className="castle-label">Coming Soon</span>
          </button>
        ))}
      {wiping && <span className="castle-wipe" aria-hidden />}
    </div>
  );
}

// START, ABOUT, SETTINGS: a row of terminal options. The arrow keys step along it.
function TitleMenu({ open, hidden }: { open: (s: 'about' | 'settings') => void; hidden: boolean }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!hidden) first.current?.focus();
  }, [hidden]);
  const step = (e: React.KeyboardEvent<HTMLElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + d + buttons.length) % buttons.length]?.focus();
  };
  return (
    <nav className="title-menu" aria-label="Castle House" onKeyDown={step} hidden={hidden}>
      <button ref={first} onClick={intro.start} data-testid="title-start">
        Start
      </button>
      <button onClick={() => open('about')} data-testid="title-about">
        About
      </button>
      <button onClick={() => open('settings')} data-testid="title-settings">
        Settings
      </button>
    </nav>
  );
}

// ABOUT and SETTINGS open over the blurred globe, powering on like the war room's panels.
function Sheet({ which, close }: { which: 'about' | 'settings'; close: () => void }) {
  const skip = useGame((s) => s.settings.skipIntro);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    done.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="overlay title-sheet" data-testid={`title-${which}-panel`}>
      {which === 'about' ? (
        <section className="panel menu" role="dialog" aria-label="About">
          <h2>ABOUT</h2>
          {/* Placeholder copy (ILI-1290): Chad's words to come. */}
          <p>Castle House is a private military support desk: one satellite, one ordnance net, one team on the ground.</p>
          <p>A game by Chad Bercea.</p>
          <a href="../">Portfolio</a>
          <button ref={done} onClick={close}>
            Back
          </button>
        </section>
      ) : (
        <section className="panel menu" role="dialog" aria-label="Settings">
          <h2>SETTINGS</h2>
          <MapViews />
          <div className="views" role="group" aria-label="Intro">
            <button aria-pressed={skip} onClick={() => game.setSettings({ skipIntro: !skip })} data-testid="skip-intro">
              Skip intro
            </button>
          </div>
          <button ref={done} onClick={close}>
            Back
          </button>
        </section>
      )}
    </div>
  );
}

// The login (ILI-1282): the terminal comes up line by line, then gives way to the war room.
function Login({ running, leaving }: { running: boolean; leaving: boolean }) {
  return (
    <div className="login" data-leaving={leaving || undefined} data-testid="intro-login">
      <RookMark small />
      {running && (
        <ol>
          {LOGIN_LINES.map(([k, v], i) => (
            <li key={k} style={{ '--d': `${i * LINE_MS}ms` } as React.CSSProperties}>
              <span className="k">{k}</span>
              {v && (
                <>
                  <span className="dots" aria-hidden />
                  <b>{v}</b>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The rook in outline, for the login's header and wherever there's no WebGL.
function RookMark({ small }: { small?: boolean }) {
  return (
    <svg className={small ? 'rook-mark small' : 'rook-mark'} viewBox="0 0 40 52" aria-hidden>
      <path d="M6 50h28v-4l-3-3h-2l-2-24 4-4V5h-5v4h-4V5h-4v4h-4V5H9v10l4 4-2 24H9l-3 3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
