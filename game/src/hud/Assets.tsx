import { useGame } from '../sim/store';
import { gameSpan } from '../sim/gameTime';

// HQ's assets by the map's tools (ILI-1187, out of the header): the budget, how loud the PMC
// has been, and support on its way. ORION-3 has its own panel (ILI-1195).
export function Assets() {
  const s = useGame((x) => x);
  const noise = Math.round(s.noise);
  return (
    <div className="panel assets">
      <p className="resources" data-testid="resources">
        Budget ${s.resources.budget.toLocaleString('en-US')}
      </p>
      <p className="noise" data-testid="noise" data-alerted={s.alerted}>
        <span className="label">noise</span>{' '}
        <span className="bar" role="meter" aria-label="Noise" aria-valuenow={noise}>
          <span style={{ width: `${noise}%` }} />
        </span>
        {s.alerted && <b> ALERTED</b>}
      </p>
      {s.inbound.map((i) => (
        <p key={i.kind} className="inbound" data-testid={`inbound-${i.kind}`}>
          resupply bird inbound · {gameSpan(i.arrivesMs - s.elapsedMs)}
        </p>
      ))}
    </div>
  );
}
