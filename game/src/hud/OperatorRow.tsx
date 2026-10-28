import { ammoLeft, condition, medsLeft, type Operator } from '../sim/team';

// One beat of an ECG trace, repeated; the strip scrolls left under a fixed window. Faster as
// the operator gets worse, flat when down (ILI-1123, back in ILI-1186).
const BEAT = 'M0 10 H8 L10 7 L12 10 H15 L17 2 L19 17 L21 10 H26 L29 6 L32 10 H40';

export function Heartbeat({ o }: { o: Operator }) {
  const c = condition(o);
  return (
    <svg className="ecg" data-condition={c} viewBox="0 0 40 20" preserveAspectRatio="none" aria-hidden>
      {c === 'down' ? (
        <path d="M0 10 H40" />
      ) : (
        <g className="trace">
          <path d={BEAT} />
          <path d={BEAT} transform="translate(40 0)" />
        </g>
      )}
    </svg>
  );
}

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

// One operator in the team panel: rank, name, role, heartbeat, status, how loud they've been
// (ILI-1222) and every supply.
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
        <Heartbeat o={o} />
        <span className="status">{STATUS[c]}</span>
        <span className="noise" data-testid={`noise-${o.id}`} title={`${o.name} noise`}>
          <Bar value={o.noise / 100} label={`${o.name} noise`} />
        </span>
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
