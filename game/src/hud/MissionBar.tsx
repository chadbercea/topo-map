import { game, useGame } from '../sim/store';
import { MAX_SCANS } from '../sim/scans';
import { currentCall, waitingCalls } from '../sim/comms';
import { callDeadline, nextUp, phasePips } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { RadioLog } from './RadioLog';

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// The mission bar (ILI-1170, ILI-1173): one strip along the top that answers "where are we
// and what's next". Phase pips, the objective, Now (ALPHA's activity) and Next (the most
// pressing thing), the resources, and the clock with pause. A minimized or held-back call
// waits here as a chip.
export function MissionBar() {
  const s = useGame((x) => x);
  const { timer, phase, tick, resources, alerted, deniability, inbound, elapsedMs: now } = s;
  const noise = Math.round(s.noise);
  const recharge = resources.rechargeAtMs === null ? null : Math.ceil((resources.rechargeAtMs - now) / 1000);
  const next = nextUp(s);
  const job = s.sideJob;
  const calls = waitingCalls(s.comms);
  const call = currentCall(s.comms);
  const playing = s.minigame?.status === 'active';
  const deadline = call ? callDeadline(s, call) : null;
  const remaining = timer.remainingMs;

  return (
    <section className="panel bar-top" data-testid="mission-timer" data-phase={phase}>
      <div className="mission">
        <h2>{s.mission.name.replace('Operation ', '').toUpperCase()}</h2>
        <ol className="pips" data-testid="phase-pips">
          {phasePips(s).map((p) => (
            <li key={p.key} data-state={p.state} title={p.label}>
              <span className="pip">{p.key}</span>
              <span className="pip-label">{p.label.slice(2)}</span>
              {p.detail && <span className="pip-detail">{p.detail}</span>}
            </li>
          ))}
        </ol>
      </div>
      <div className="now-next">
        <p className="objective" data-testid="objective">
          ◆ {objectiveText(s.mission)}
        </p>
        <p className="lines">
          <span className="now" data-testid="now">
            Now: {s.team.activity}
          </span>
          <span className="next" data-testid="next" data-tone={next.tone}>
            Next: {next.text}
            {next.atMs !== undefined && ` · ${clock(next.atMs - now)}`}
          </span>
        </p>
      </div>
      <div className="stats">
        <p className="resources" data-testid="resources">
          scans {resources.scans}/{MAX_SCANS}
          {recharge !== null && <span className="recharge"> +1 in {recharge}s</span>} · ${resources.budget.toLocaleString('en-US')}
        </p>
        <p className="noise" data-testid="noise" data-alerted={alerted}>
          noise <span className="bar" role="meter" aria-label="Noise" aria-valuenow={noise}><span style={{ width: `${noise}%` }} /></span>
          {alerted && <b> ALERTED</b>}
        </p>
        {deniability !== 'clean' && (
          <p className="deniability" data-testid="deniability" data-state={deniability}>
            client: {deniability === 'warned' ? 'warning, keep it quiet' : 'DISOWNED, no contract, no support'}
          </p>
        )}
        {job?.status === 'active' && job.deadlineMs !== null && (
          <p className="side-job" data-testid="side-job">
            side job: {job.square} imagery · {Math.ceil((job.deadlineMs - now) / 1000)}s · +${job.reward.toLocaleString('en-US')}
          </p>
        )}
        {inbound.map((i) => (
          <p key={i.kind} className="inbound" data-testid={`inbound-${i.kind}`}>
            {i.kind === 'resupply' ? 'resupply bird' : 'reinforcements'} inbound · {Math.max(0, Math.ceil((i.arrivesMs - now) / 1000))}s
          </p>
        ))}
      </div>
      {call && (s.comms.minimized || playing) && (
        <button className="comms-badge" onClick={() => game.setCommsMinimized(false)} disabled={playing} data-testid="comms-badge">
          ◂ {call.from} needs a decision
          {calls.length > 1 && ` (+${calls.length - 1})`}
          {deadline !== null && ` · ${clock(deadline - now)}`}
        </button>
      )}
      <RadioLog />
      <div className="timer-row">
        <span className="clock" data-testid="clock" data-warn={remaining <= 60_000 ? 'red' : remaining <= 180_000 ? 'amber' : undefined}>
          {clock(remaining)}
        </span>
        <button className="pause" onClick={game.pause} disabled={phase !== 'running'} aria-label="Pause" data-testid="pause-toggle">
          ❚❚
        </button>
        <span className="sr-only" data-testid="tick">
          {tick}
        </span>
      </div>
    </section>
  );
}
