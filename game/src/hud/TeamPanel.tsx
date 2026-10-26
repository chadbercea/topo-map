import { useGame } from '../sim/store';
import { teamFatigue } from '../sim/movement';

// Team panel in Mode A (GDD): callsign, what the team is doing, a general status line.
// The full operator readout with heartbeats (Mode B) is ILI-1123.
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fit = useGame((s) => s.team.operators.filter((o) => o.health > 0).length);
  const size = useGame((s) => s.team.operators.length);
  const fatigue = useGame((s) => Math.round(teamFatigue(s.team.operators)));
  return (
    <section className="panel team" data-testid="team-panel">
      <h2>{callsign}</h2>
      <p className="activity">{activity}</p>
      <p>
        {fit}/{size} fit · fatigue {fatigue}%
      </p>
    </section>
  );
}
