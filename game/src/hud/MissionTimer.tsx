import { game, useGame } from '../sim/store';

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Mission timer widget (GDD: right side). The pause button opens the pause menu.
export function MissionTimer() {
  const remaining = useGame((s) => s.timer.remainingMs);
  const phase = useGame((s) => s.phase);
  const tick = useGame((s) => s.tick);
  const scans = useGame((s) => s.resources.scans);
  const budget = useGame((s) => s.resources.budget);

  return (
    <section className="panel timer" data-testid="mission-timer" data-phase={phase}>
      <h2>MISSION</h2>
      <div className="timer-row">
        <span className="clock" data-testid="clock">
          {clock(remaining)}
        </span>
        <button
          className="pause"
          onClick={game.pause}
          disabled={phase !== 'running'}
          aria-label="Pause"
          data-testid="pause-toggle"
        >
          ❚❚
        </button>
      </div>
      <p>
        {phase === 'running' ? 'LIVE' : phase.toUpperCase()} · tick{' '}
        <span data-testid="tick">{tick}</span>
      </p>
      <p className="resources" data-testid="resources">
        scans {scans} · ${budget.toLocaleString('en-US')}
      </p>
    </section>
  );
}
