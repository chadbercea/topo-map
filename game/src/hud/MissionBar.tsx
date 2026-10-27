import { game, useGame } from '../sim/store';
import { satelliteStatus } from '../sim/satellite';
import { nextUp, phasePips } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { gameClock, gameSpan } from '../sim/gameTime';
import { RadioLog } from './RadioLog';

export const clock = (ms: number) => gameClock(ms);

// The mission bar (ILI-1170, ILI-1173, quieted in ILI-1179): one strip along the top that
// answers "where are we and what's next". Phase pips, the objective and the one next thing,
// the resources, and the clock with pause. ALPHA and its calls live in the team and satcom
// panels, bottom right (ILI-1186). Until the team is linked, HQ doesn't know its mission.
export function MissionBar() {
  const s = useGame((x) => x);
  const { timer, phase, tick, resources, alerted, inbound, elapsedMs: now } = s;
  const noise = Math.round(s.noise);
  const next = nextUp(s);
  const remaining = timer.remainingMs;
  const linked = s.link.state === 'linked';

  return (
    <section className="panel bar-top" data-testid="mission-timer" data-phase={phase}>
      <div className="mission">
        <h2>{linked ? s.link.codename : 'NO TEAM LINKED'}</h2>
        {linked && (
          <ol className="pips" data-testid="phase-pips">
            {phasePips(s).map((p) => (
              <li key={p.key} data-state={p.state} title={p.label}>
                <span className="pip">{p.key}</span>
                <span className="pip-label">{p.label.slice(2)}</span>
                {p.detail && <span className="pip-detail">{p.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="now-next">
        <p className="objective" data-testid="objective">
          ◆ {linked ? objectiveText(s.mission) : 'Find a team in the field to support'}
        </p>
        <p className="lines">
          <span className="next" data-testid="next" data-tone={next.tone}>
            Next: {next.text}
            {next.atMs !== undefined && ` · ${gameSpan(next.atMs - now)}`}
          </span>
        </p>
      </div>
      <span className="break" aria-hidden />
      <div className="stats">
        <p className="resources" data-testid="resources">
          <span data-testid="satellite-status">{satelliteStatus(s)}</span> · ${resources.budget.toLocaleString('en-US')}
        </p>
        <p className="noise" data-testid="noise" data-alerted={alerted}>
          <span className="label">noise</span> <span className="bar" role="meter" aria-label="Noise" aria-valuenow={noise}><span style={{ width: `${noise}%` }} /></span>
          {alerted && <b> ALERTED</b>}
        </p>
        {inbound.map((i) => (
          <p key={i.kind} className="inbound" data-testid={`inbound-${i.kind}`}>
            resupply bird inbound · {gameSpan(i.arrivesMs - now)}
          </p>
        ))}
      </div>
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
