import { useState } from 'react';
import { useGame } from '../sim/store';
import { OperatorRow } from './OperatorRow';

// Team panel (ILI-1172). It keeps one size: a compact row per operator (heartbeat, name,
// key supply, status) that reacts to the fight instead of the panel opening up, and a red
// edge while ALPHA is engaged. Tap the header for the full readout; tap again to close it.
// Calls live in their own card (CallCard).
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const fit = useGame((s) => s.team.operators.filter((o) => o.health > 0).length);
  const size = useGame((s) => s.team.operators.length);
  const operators = useGame((s) => s.team.operators);
  const [open, setOpen] = useState(false);

  return (
    <section className="panel team" data-testid="team-panel" data-open={open} data-fight={fighting}>
      <button className="panel-toggle team-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>{callsign}</h2>
        <span className="hint">{open ? '▾' : '▸'}</span>
      </button>
      <p className="activity">{activity}</p>
      <ul className={open ? 'readout' : 'rows'} data-testid={open ? 'readout' : 'team-rows'}>
        {operators.map((o) => (
          <OperatorRow key={o.id} o={o} compact={!open} />
        ))}
      </ul>
      <p className="stats">
        {fit}/{size} fit
      </p>
    </section>
  );
}
