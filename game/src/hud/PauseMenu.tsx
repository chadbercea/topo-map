import { useEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { saveSettings } from './settings';

const TITLES = { paused: 'PAUSED', ended: 'TIME UP', exited: 'MISSION ABORTED' } as const;

// Pause overlay: opens over the frozen map whenever the mission isn't running.
export function PauseMenu() {
  const phase = useGame((s) => s.phase);
  const sound = useGame((s) => s.settings.sound);
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

  useEffect(() => saveSettings(game.get().settings), [sound]);
  useEffect(() => first.current?.focus(), [phase]);

  if (phase === 'running') return null;

  return (
    <div className="overlay" data-testid="pause-menu" data-phase={phase}>
      <section className="panel menu" role="dialog" aria-label={TITLES[phase]}>
        <h2>{TITLES[phase]}</h2>
        {phase === 'paused' && (
          <button ref={first} onClick={game.resume}>
            Resume
          </button>
        )}
        {phase === 'ended' && (
          <button ref={first} onClick={game.restart}>
            Retry
          </button>
        )}
        {phase === 'exited' ? (
          <button ref={first} onClick={game.restart}>
            Start mission
          </button>
        ) : (
          <>
            {phase === 'paused' && <button onClick={game.restart}>Restart</button>}
            <fieldset>
              <legend>Settings</legend>
              <label>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => game.setSettings({ sound: e.target.checked })}
                  data-testid="sound"
                />
                Sound
              </label>
            </fieldset>
            <button onClick={game.exit}>Exit</button>
          </>
        )}
      </section>
    </div>
  );
}
