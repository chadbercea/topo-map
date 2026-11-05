import { useMemo } from 'react';
import { useGame } from '../sim/store';
import type { IntelItem } from '../sim/intel';
import { useTier } from './tier';

// INTEL (ILI-1361, IA v2 draft A, ILI-1363): right under ORION-3's picture, so every scan's
// intel lands next to the look that brought it in. Each report is one of the five types
// (ILI-1362), newest on top. A fixed number of rows, older ones folded into a count, so the
// panel never scrolls and never changes size, and ORION-3 above it never moves.
const ROWS = { wide: 5, medium: 3, compact: 2 } as const;

type Row = IntelItem & { key: string; square?: string; banked: boolean; fresh: boolean };

export function IntelPanel() {
  const pushes = useGame((s) => s.intel.pushes);
  const tier = useTier();
  const rows = useMemo(() => {
    const out: Row[] = [];
    const last = pushes.at(-1);
    for (const p of [...pushes].reverse())
      (p.items ?? []).forEach((it, i) => out.push({ ...it, key: `${p.id}-${i}`, square: p.square, banked: p.state === 'banked', fresh: p === last }));
    return out;
  }, [pushes]);
  const n = ROWS[tier];
  const last = pushes.at(-1);
  const latest = last?.items?.length ?? 0;
  const earlier = Math.max(0, rows.length - n);

  return (
    <section className="panel intel-panel" data-testid="intel-panel" aria-label="Intel" style={{ ['--rows' as string]: n }}>
      <h2>
        <span>INTEL</span>
        <span className="status" data-testid="intel-latest">
          {latest ? `+${latest}${last?.square ? ` from ${last.square}` : ''}` : 'Every scan brings some in'}
        </span>
      </h2>
      <ol aria-live="polite">
        {rows.slice(0, n).map((r) => (
          <li key={r.key} data-testid="intel-item" data-kind={r.kind} data-heat={r.heat} data-banked={r.banked || undefined} data-fresh={r.fresh || undefined}>
            <i className="int">{r.kind}</i>
            <span className="txt">
              {r.square && <b>{r.square}</b>} {r.text}
            </span>
            {r.banked && <em>banked</em>}
          </li>
        ))}
      </ol>
      <p className="earlier" data-testid="intel-earlier">{earlier ? `+ ${earlier} earlier` : ''}</p>
    </section>
  );
}
