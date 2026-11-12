import { useGame } from '../sim/store';
import { condition } from '../sim/team';

const RANK = { fine: 0, caution: 1, danger: 2, down: 3 } as const;

// A phone's panel targets say what's in them at a glance (ILI-1461): where ORION-3 is, how the team
// is (its worst operator), and how much is new on the net.
export function ChipStatus({ tab }: { tab: 'orion' | 'team' | 'satcom' }) {
  const line = useGame((s) => {
    if (tab === 'orion') return s.satellite.state === 'slewing' ? `→ ${s.satellite.aim}` : s.satellite.aim;
    if (tab === 'team') return s.team.operators.map(condition).sort((a, b) => RANK[b] - RANK[a])[0] ?? 'fine';
    return '';
  });
  if (!line) return null;
  return (
    <small className="chip-status" data-cond={tab === 'team' ? line : undefined}>
      {line}
    </small>
  );
}
