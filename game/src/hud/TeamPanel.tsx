import { useGame } from '../sim/store';
import { OperatorRow } from './OperatorRow';
import { Recentre } from './Recentre';
import { gauge, MOVE_AT } from '../sim/intel';

// The team panel (ILI-1123, bottom right since ILI-1186): every operator's heartbeat,
// status, noise (ILI-1222), ammo and meds, always on screen, with what the team is doing over
// it. Red while it's engaged. Titled ALPHA TEAM (ILI-1248); no team totals, each row carries
// its own (ILI-1223).
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const alerted = useGame((s) => s.alerted);
  const operators = useGame((s) => s.team.operators);
  const intel = useGame((s) => Math.round(gauge(s)));

  return (
    <section className="panel team" data-testid="team-panel" data-fight={fighting} aria-label={`${callsign} team`}>
      <h2>
        <span className="callsign" data-testid="team-title">
          {callsign} TEAM
        </span>
        {/* The intel gauge (ILI-1314): what keeps ALPHA moving. A bar, not a number; the tick
            is where it starts to move. */}
        <span className="intel-gauge" role="meter" aria-label="Intel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={intel} data-testid="intel-gauge" data-low={intel < MOVE_AT || undefined}>
          <i style={{ width: `${intel}%` }} />
          <b style={{ left: `${MOVE_AT}%` }} />
        </span>
        <span className="activity">{activity}</span>
        {alerted && ( // the enemy knows a PMC is here; each operator's noise is on their row
          <b className="alerted" data-testid="alerted">
            ALERTED
          </b>
        )}
      </h2>
      <Recentre />
      <ul className="readout" data-testid="readout">
        {operators.map((o) => (
          <OperatorRow key={o.id} o={o} />
        ))}
      </ul>
    </section>
  );
}
