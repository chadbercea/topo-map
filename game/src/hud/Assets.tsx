import { useGame } from '../sim/store';
import { gameSpan } from '../sim/gameTime';

// Logistics (ILI-1226): a small widget along the bottom, with the budget and support on its
// way. Noise is per operator, on the team panel (ILI-1222). ILI-1224 fills it out.
export function Assets() {
  const s = useGame((x) => x);
  return (
    <section className="panel small-widget assets" aria-label="Logistics">
      <h2>LOGISTICS</h2>
      <p className="resources" data-testid="resources">
        Budget ${s.resources.budget.toLocaleString('en-US')}
      </p>
      {s.inbound.map((i) => (
        <p key={i.kind} className="inbound" data-testid={`inbound-${i.kind}`}>
          resupply bird inbound · {gameSpan(i.arrivesMs - s.elapsedMs)}
        </p>
      ))}
    </section>
  );
}
