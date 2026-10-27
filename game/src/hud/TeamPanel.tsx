import { useGame } from '../sim/store';
import { ammoLevel, medsLevel } from '../sim/support';
import { Bar, OperatorRow } from './OperatorRow';

// The team panel (ILI-1123, bottom right since ILI-1186): every operator's heartbeat,
// status, ammo and meds, always on screen, with what ALPHA is doing over it. Red while it's
// engaged. Before HQ has linked the team there's no telemetry to show.
export function TeamPanel() {
  const linked = useGame((s) => s.link.state === 'linked');
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const operators = useGame((s) => s.team.operators);
  const ammo = useGame(ammoLevel);
  const meds = useGame(medsLevel);
  const fit = operators.filter((o) => o.health > 0).length;

  if (!linked)
    return (
      <section className="panel team" data-testid="team-panel" data-linked={false} aria-label="Team">
        <h2>TEAM · NO LINK</h2>
        <p className="no-link">No team linked. Send a SITREP on satcom, then find the team’s code name in the intel stream.</p>
      </section>
    );

  return (
    <section className="panel team" data-testid="team-panel" data-linked={true} data-fight={fighting} aria-label={`${callsign} team`}>
      <h2>
        <span className="callsign">{callsign}</span>
        <span className="activity">{activity}</span>
      </h2>
      <p className="condition" data-testid="team-condition">
        <span className="fit">
          {fit}/{operators.length} fit
        </span>
        <span>AMMO</span>
        <Bar value={ammo} label="Team ammo" />
        <span>MEDS</span>
        <Bar value={meds} label="Team meds" />
      </p>
      <ul className="readout" data-testid="readout">
        {operators.map((o) => (
          <OperatorRow key={o.id} o={o} />
        ))}
      </ul>
    </section>
  );
}
