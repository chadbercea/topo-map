import { useEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { MapViews } from './MapViews';

const TITLES = { paused: 'PAUSED', exited: 'MISSION ABORTED' } as const;

// Pause overlay: opens over the frozen map when paused or after Exit. The end of a mission
// gets the wrap-up instead (WrapUp.tsx).
export function PauseMenu() {
  const phase = useGame((s) => s.phase);
  const first = useRef<HTMLButtonElement>(null);

  // Esc or P toggles pause; switching tabs pauses so the clock can't run out unseen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') return;
      const { phase } = game.get();
      if (phase === 'running') game.pause();
      else if (phase === 'paused') game.resume();
    };
    const onHide = () => document.hidden && game.pause();
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => first.current?.focus(), [phase]);

  if (phase !== 'paused' && phase !== 'exited') return null; // the briefing and the wrap-up have their own

  return (
    <div className="overlay" data-testid="pause-menu" data-phase={phase}>
      <section className="panel menu" role="dialog" aria-label={TITLES[phase]}>
        <h2>{TITLES[phase]}</h2>
        {phase === 'paused' && (
          <button ref={first} onClick={game.resume}>
            Resume
          </button>
        )}
        {phase === 'exited' ? (
          <button ref={first} onClick={game.restart}>
            Start mission
          </button>
        ) : (
          <>
            {phase === 'paused' && <button onClick={game.restart}>Restart</button>}
            <MapViews />
            <button onClick={game.exit}>Exit</button>
          </>
        )}
      </section>
    </div>
  );
}
