import { useState } from 'react';
import { useGame } from '../sim/store';
import { ammoLevel, medsLevel } from '../sim/support';
import { condition } from '../sim/team';
import { Bar, OperatorRow, STATUS } from './OperatorRow';

// Team panel (ILI-1172, quieted in ILI-1179): what ALPHA is doing, and the team's condition
// in one line (fit count, ammo, meds) with who's hurt under it. It keeps one size, with a
// red edge while ALPHA is engaged. Tap the header for every operator's readout.
// Calls live in their own card (CallCard).
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const operators = useGame((s) => s.team.operators);
  const ammo = useGame(ammoLevel);
  const meds = useGame(medsLevel);
  const [open, setOpen] = useState(false);
  const fit = operators.filter((o) => o.health > 0).length;
  const hurt = operators.filter((o) => condition(o) !== 'fine');

  return (
    <section className="panel team" data-testid="team-panel" data-open={open} data-fight={fighting}>
      <button className="panel-toggle team-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2>{callsign}</h2>
        <span className="hint">{open ? '▾' : '▸'}</span>
      </button>
      <p className="activity">{activity}</p>
      {open ? (
        <ul className="readout" data-testid="readout">
          {operators.map((o) => (
            <OperatorRow key={o.id} o={o} />
          ))}
        </ul>
      ) : (
        <div className="condition" data-testid="team-condition">
          <span className="fit">
            {fit}/{operators.length} fit
          </span>
          <span>AMMO</span>
          <Bar value={ammo} label="Team ammo" />
          <span>MEDS</span>
          <Bar value={meds} label="Team meds" />
          <p className="hurt" data-testid="team-hurt">
            {hurt.length
              ? hurt.map((o) => (
                  <span key={o.id} className="op" data-condition={condition(o)} data-testid={`op-${o.id}`}>
                    {o.name} <span className="status">{STATUS[condition(o)]}</span>
                  </span>
                ))
              : 'All fine'}
          </p>
        </div>
      )}
    </section>
  );
}
