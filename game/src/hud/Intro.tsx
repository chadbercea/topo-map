import { useEffect, useRef, useState } from 'react';
import type { OrionSpot } from './castleScene'; // a type only: the scene loads lazily
import { intro, LINE_MS, LOGIN_LINES, useIntro, WIPE_MS } from './intro';

// The way in (ILI-1280): Castle House's idle terminal, the wipe, the login, and the link with
// ALPHA. The HUD's own panels power on between the login and the link (Hud.tsx, styles.css).

export function Intro() {
  const stage = useIntro();
  if (stage === 'live') return null;
  return (
    <div className="intro" data-stage={stage} data-testid="intro" style={{ '--wipe': `${WIPE_MS}ms` } as React.CSSProperties}>
      {(stage === 'wipe' || stage === 'login' || stage === 'panels') && <Login running={stage !== 'wipe'} leaving={stage === 'panels'} />}
      {(stage === 'idle' || stage === 'wipe') && <Terminal wiping={stage === 'wipe'} />}
      {stage === 'link' && (
        <div className="panel intro-link" data-testid="intro-link" role="status">
          <h2>ORION-3 ⇄ ALPHA</h2>
          <p>SATCOM link established</p>
        </div>
      )}
    </div>
  );
}

// Castle House at rest (ILI-1283): the rook, the globe, the satellites; ORION-3 pings to be picked.
function Terminal({ wiping }: { wiping: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<OrionSpot | null>(null);
  const [flat, setFlat] = useState(false); // no WebGL: a still mark, and ORION-3 at a fixed spot

  useEffect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    import('./castleScene').then(({ mountCastle }) => {
      if (gone || !host.current) return;
      stop = mountCastle(host.current, setSpot, navigator.webdriver === true);
      if (!stop) setFlat(true);
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  const at = flat ? { x: innerWidth * 0.72, y: innerHeight * 0.3, visible: true } : spot;
  return (
    <div className="castle" data-wiping={wiping || undefined}>
      <div ref={host} className="castle-scene" />
      {flat && <RookMark />}
      <div className="castle-mark">
        <h1>CASTLE HOUSE</h1>
        <p>Private military support · secure terminal</p>
        <p className="castle-status">
          STANDBY · awaiting uplink<span className="caret">▌</span>
        </p>
      </div>
      {at && (
        <button
          className="castle-orion"
          style={{ left: at.x, top: at.y }}
          data-side={at.x > innerWidth * 0.6 ? 'left' : undefined}
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
      {wiping && <span className="castle-wipe" aria-hidden />}
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
