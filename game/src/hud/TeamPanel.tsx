import { useGame } from '../sim/store';
import { OperatorRow } from './OperatorRow';

// The team panel (ILI-1123, bottom right since ILI-1186): every operator's heartbeat,
// status, noise (ILI-1222), ammo and meds, always on screen, with what the team is doing over
// it. Red while it's engaged. Titled TEAM, not the callsign; no team totals, each row carries
// its own (ILI-1223).
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const alerted = useGame((s) => s.alerted);
  const operators = useGame((s) => s.team.operators);

  return (
    <section className="panel team" data-testid="team-panel" data-fight={fighting} aria-label={`${callsign} team`}>
      <h2>
        <span className="callsign" data-testid="team-title">
          TEAM
        </span>
        <span className="activity">{activity}</span>
        {alerted && ( // the enemy knows a PMC is here; each operator's noise is on their row
          <b className="alerted" data-testid="alerted">
            ALERTED
          </b>
        )}
      </h2>
      <ul className="readout" data-testid="readout">
        {operators.map((o) => (
          <OperatorRow key={o.id} o={o} />
        ))}
      </ul>
    </section>
  );
}
