import { useEffect } from 'react';
import { game, useGame } from '../sim/store';

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const toggle = () => (game.get().phase === 'paused' ? game.resume() : game.pause());

// Mission timer widget (GDD: right side). The pause button becomes the pause menu in ILI-1115.
export function MissionTimer() {
  const remaining = useGame((s) => s.timer.remainingMs);
  const phase = useGame((s) => s.phase);
  const tick = useGame((s) => s.tick);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="panel timer" data-testid="mission-timer" data-phase={phase}>
      <h2>MISSION</h2>
      <div className="timer-row">
        <span className="clock" data-testid="clock">
          {clock(remaining)}
        </span>
        <button
          className="pause"
          onClick={toggle}
          disabled={phase === 'ended'}
          aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
          data-testid="pause-toggle"
        >
          {phase === 'paused' ? '▶' : '❚❚'}
        </button>
      </div>
      <p>
        {phase === 'ended' ? 'TIME UP' : phase === 'paused' ? 'PAUSED' : 'LIVE'} · tick{' '}
        <span data-testid="tick">{tick}</span>
      </p>
    </section>
  );
}
