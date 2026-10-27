import { useState } from 'react';
import { useGame } from '../sim/store';
import { ammoLevel, medsLevel } from '../sim/support';
import { condition } from '../sim/team';
import { Bar, OperatorRow, STATUS } from './OperatorRow';

// ALPHA in the mission bar (ILI-1183): what it's doing and the team's condition (fit count,
// ammo, meds, who's hurt) on one line, red while it's engaged. Tap it for every operator's
// readout, which drops down under the bar. It used to be its own panel beside the map.
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
    <div className="team" data-testid="team-panel" data-open={open} data-fight={fighting}>
      <button className="team-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b className="callsign">{callsign}</b>
        <span className="activity">{activity}</span>
        <span className="condition" data-testid="team-condition">
          <span className="fit">
            {fit}/{operators.length} fit
          </span>
          <span className="supply">AMMO</span>
          <Bar value={ammo} label="Team ammo" />
          <span className="supply">MEDS</span>
          <Bar value={meds} label="Team meds" />
        </span>
        <span className={hurt.length ? 'hurt' : 'hurt fine'} data-testid="team-hurt">
          {hurt.length
            ? hurt.map((o) => (
                <span key={o.id} className="op" data-condition={condition(o)} data-testid={`op-${o.id}`}>
                  {o.name} <span className="status">{STATUS[condition(o)]}</span>
                </span>
              ))
            : 'All fine'}
        </span>
      </button>
      {open && (
        <section className="panel team-readout" aria-label={`${callsign} readout`}>
          <ul className="readout" data-testid="readout">
            {operators.map((o) => (
              <OperatorRow key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
