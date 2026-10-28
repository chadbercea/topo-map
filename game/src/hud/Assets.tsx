import { useGame } from '../sim/store';
import { gameSpan } from '../sim/gameTime';

// HQ's assets by the map's tools (ILI-1187, out of the header): the budget and support on its
// way. Noise is per operator, on the team panel (ILI-1222). ORION-3 has its own panel (ILI-1195).
export function Assets() {
  const s = useGame((x) => x);
  return (
    <div className="panel assets">
      <p className="resources" data-testid="resources">
        Budget ${s.resources.budget.toLocaleString('en-US')}
      </p>
      {s.inbound.map((i) => (
        <p key={i.kind} className="inbound" data-testid={`inbound-${i.kind}`}>
          resupply bird inbound · {gameSpan(i.arrivesMs - s.elapsedMs)}
        </p>
      ))}
    </div>
  );
}
