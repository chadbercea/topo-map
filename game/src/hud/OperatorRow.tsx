import type { ReactNode } from 'react';
import { ammoLeft, condition, medsLeft, type Operator } from '../sim/team';
import { LOW } from '../sim/support';
import { SUSPICIOUS_NOISE } from '../sim/imagery';
import { ALERT_AT } from '../sim/noise';

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

export const STATUS = { fine: 'FINE', caution: 'CAUTION', danger: 'DANGER', down: 'DOWN' } as const;

type Level = 'ok' | 'low' | 'out';
// Ammo and meds as short bars (ILI-1248): green while there's enough, amber under the resupply
// line, red when it's gone.
const supply = (left: number): Level => (left <= 0.1 ? 'out' : left < LOW ? 'low' : 'ok');
// Noise, for the row's edge: enough to make them suspicious, enough to raise the alarm.
const loudness = (n: number): Level => (n >= ALERT_AT ? 'out' : n >= SUSPICIOUS_NOISE ? 'low' : 'ok');

// The gauges' labels as pictures (ILI-1265): three rounds side by side for ammo, a red cross for meds.
const Rounds = () => (
  <svg className="k rounds" viewBox="0 0 11 10" aria-hidden>
    {[0, 4, 8].map((x) => (
      <path key={x} d={`M${x} 10 V4.5 Q${x + 1.5} 0 ${x + 3} 4.5 V10 Z`} />
    ))}
  </svg>
);
const Cross = () => (
  <svg className="k cross" viewBox="0 0 10 10" aria-hidden>
    <path d="M3.5 0h3v3.5h3.5v3h-3.5v3.5h-3v-3.5h-3.5v-3h3.5z" />
  </svg>
);

function Gauge({ label, icon, value, level, name, testId }: { label: string; icon?: ReactNode; value: number; level?: Level; name: string; testId?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="gauge" data-level={level} data-testid={testId}>
      {icon}
      <span className="bar" role="meter" aria-label={`${name} ${label.toLowerCase()}`} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

// One operator in the team panel (ILI-1248): rank, name and role in even columns; heartbeat and
// status; then ammo and meds as short bars under their pictures, and how loud they've been moving (ILI-1222) as an
// orange one. The row gets a coloured edge when something's wrong: hurt, low or loud.
export function OperatorRow({ o }: { o: Operator }) {
  const c = condition(o);
  const levels = [supply(ammoLeft(o)), supply(medsLeft(o)), loudness(o.noise)];
  const flag = c === 'down' ? 'down' : c === 'danger' || levels.includes('out') ? 'danger' : c === 'caution' || levels.includes('low') ? 'caution' : undefined;
  return (
    <li className="op" data-condition={c} data-flag={flag} data-testid={`op-${o.id}`}>
      <div className="who">
        <RankIcon grade={o.rank.grade} title={o.rank.title} />
        <span className="name">{o.name}</span>
        <span className="role">{o.role}</span>
      </div>
      <div className="vitals">
        <Heartbeat o={o} />
        <span className="status">{STATUS[c]}</span>
      </div>
      <div className="supplies">
        <Gauge label="AMMO" icon={<Rounds />} value={ammoLeft(o) * 100} level={levels[0]} name={o.name} testId={`ammo-${o.id}`} />
        <Gauge label="MEDS" icon={<Cross />} value={medsLeft(o) * 100} level={levels[1]} name={o.name} testId={`meds-${o.id}`} />
        <Gauge label="NOISE" value={o.noise} name={o.name} testId={`noise-${o.id}`} />
      </div>
    </li>
  );
}
