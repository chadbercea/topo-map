import { game, useGame } from '../sim/store';
import { MAX_SCANS } from '../sim/scans';

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
  const noise = useGame((s) => Math.round(s.noise));
  const alerted = useGame((s) => s.alerted);
  const budget = useGame((s) => s.resources.budget);
  const recharge = useGame((s) => (s.resources.rechargeAtMs === null ? null : Math.ceil((s.resources.rechargeAtMs - s.elapsedMs) / 1000)));

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
      <p className="noise" data-testid="noise" data-alerted={alerted}>
        noise <span className="bar" role="meter" aria-label="Noise" aria-valuenow={noise}><span style={{ width: `${noise}%` }} /></span>
        {alerted && <b> ALERTED</b>}
      </p>
      <p className="resources" data-testid="resources">
        scans {scans}/{MAX_SCANS}
        {recharge !== null && <span className="recharge"> +1 in {recharge}s</span>} · ${budget.toLocaleString('en-US')}
      </p>
    </section>
  );
}
