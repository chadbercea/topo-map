import { useGame } from '../sim/store';
import { Heartbeat, OperatorRow, STATUS } from './OperatorRow';
import { condition } from '../sim/team';

// The team panel (ILI-1123, bottom right since ILI-1186): every operator's heartbeat,
// status, noise (ILI-1222), ammo and meds, always on screen, with what the team is doing over
// it. Red while it's engaged. Titled ALPHA TEAM (ILI-1248); no team totals, each row carries
// its own (ILI-1223).
export function TeamPanel({ highlight }: { highlight?: string | null }) {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const alerted = useGame((s) => s.alerted);
  const operators = useGame((s) => s.team.operators);

  return (
    <section className="panel team" data-testid="team-panel" data-fight={fighting} aria-label={`${callsign} team`}>
      <h2>
        <span className="callsign" data-testid="team-title">
          {callsign} TEAM
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
          <OperatorRow key={o.id} o={o} highlight={o.id === highlight} />
        ))}
      </ul>
    </section>
  );
}

// The heartbeat strip (ILI-1396): tier one, one small column per operator: name, heartbeat and
// status (ILI-1406). Tapping it opens the team panel, a drawer (tier three) that is closed until
// HQ opens it.
export function HeartbeatStrip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const callsign = useGame((s) => s.team.callsign);
  const operators = useGame((s) => s.team.operators);
  const worst = operators.map(condition).sort((a, b) => RANK[b] - RANK[a])[0];
  return (
    <button className="heartbeat-strip" onClick={onToggle} aria-expanded={open} aria-label={`${callsign} team: ${open ? 'close' : 'open'} the team panel`} data-testid="heartbeat-strip" data-worst={worst} data-overlay="heartbeats">
      {operators.map((o) => {
        const c = condition(o);
        return (
          <span key={o.id} className="hb" data-condition={c} data-testid={`hb-${o.id}`}>
            <span className="hb-name">{o.name}</span>
            <Heartbeat o={o} />
            <span className="hb-status">{STATUS[c]}</span>
          </span>
        );
      })}
    </button>
  );
}
const RANK = { fine: 0, caution: 1, danger: 2, down: 3 } as const;
