import { ammoLeft, condition, medsLeft, type Operator } from '../sim/team';

// Rank as chevrons (grade 5 = three) with a rocker per grade above that.
function RankIcon({ grade, title }: { grade: number; title: string }) {
  const rockers = Math.max(0, grade - 5);
  return (
    <svg className="rank" viewBox="0 0 12 16" role="img" aria-label={title}>
      <title>{title}</title>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M1 ${4 + i * 3} L6 ${1 + i * 3} L11 ${4 + i * 3}`} />
      ))}
      {Array.from({ length: rockers }, (_, i) => (
        <path key={`r${i}`} d={`M1 ${11 + i * 3} Q6 ${14 + i * 3} 11 ${11 + i * 3}`} />
      ))}
    </svg>
  );
}

export const Bar = ({ value, label }: { value: number; label: string }) => (
  <span className="bar" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </span>
);

export const STATUS = { fine: 'FINE', caution: 'CAUTION', danger: 'DANGER', down: 'DOWN' } as const;

// One operator in the full readout (the team panel opened): rank, name, role, status and
// every supply.
export function OperatorRow({ o }: { o: Operator }) {
  const c = condition(o);
  return (
    <li className="op" data-condition={c} data-testid={`op-${o.id}`}>
      <div className="who">
        <RankIcon grade={o.rank.grade} title={o.rank.title} />
        <span className="name">{o.name}</span>
        <span className="role">{o.role}</span>
      </div>
      <div className="vitals">
        <span className="status">{STATUS[c]}</span>
      </div>
      <div className="supplies">
        <span>AMMO</span>
        <Bar value={ammoLeft(o)} label={`${o.name} ammo`} />
        <span>MEDS</span>
        <Bar value={medsLeft(o)} label={`${o.name} meds`} />
      </div>
    </li>
  );
}
