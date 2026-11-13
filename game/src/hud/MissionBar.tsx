import { useGame } from '../sim/store';
import { race } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { EnvWidget } from './EnvWidget';
import type { GameState } from '../sim/state';

// The contract window counts down real minutes, M:SS, rounding up (ILI-1251): ten minutes reads
// 10:00.
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// The mission bar (ILI-1464, the ILI-1459 design): one bar across the top of the map, a small
// label over a big value in each cell. The operation, the client's deadline (the biggest number on
// screen), the phase (by name only, no step dots: ILI-1481), what's next and the budget. On a fold or phone only the deadline and
// budget fit. It replaces the loose timer and budget chips (ILI-1392, ILI-1405). No pause button: Escape pauses (ILI-1503), and
// the bar is only as wide as what's in it.
const PHASE_NAME = { infil: 'Infil', objective: 'Recover', exfil: 'Exfil', complete: 'Complete' } as const;

export function MissionBar() {
  const timer = useGame((s) => s.timer);
  const phase = useGame((s) => s.phase);
  const tick = useGame((s) => s.tick);
  const mission = useGame((s) => s.mission);
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 300_000 ? 'amber' : undefined;
  return (
    <section className="panel mission-bar" data-testid="mission-bar" aria-label="Mission">
      <div className="mb-row">
      <div className="mb-cell mb-op">
        <RookGlyph />
        <div>
          <small>Operation</small>
          <b>{mission.name.replace(/^Operation\s+/, '')}</b>
        </div>
      </div>
      <div className="mb-cell timer-cell" data-testid="timer" data-phase={phase} data-warn={warn} aria-label="Client deadline">
        <small className="t-label">Client deadline</small>
        <b className="clock" data-testid="clock" data-warn={warn}>
          {clock(remaining)}
        </b>
        <span className="sr-only" data-testid="tick">
          {tick}
        </span>
      </div>
      <div className="mb-cell mb-phase">
        <small>Phase</small>
        <b>
          {PHASE_NAME[mission.phase]}
        </b>
      </div>
      <div className="mb-cell mb-next">
        <small>Next</small>
        <b data-testid="objective">{objectiveText(mission)}</b>
      </div>
      <BudgetChip />
      </div>
      {/* The weather and atmospherics, along the bar's foot (ILI-1473): out of ORION-3's panel. */}
      <EnvWidget strip />
    </section>
  );
}

// Castle House's rook, small, at the head of the bar.
function RookGlyph() {
  return (
    <svg className="mb-rook" viewBox="0 0 40 52" aria-hidden>
      <path d="M6 50h28v-4l-3-3h-2l-2-24 4-4V5h-5v4h-4V5h-4v4h-4V5H9v10l4 4-2 24H9l-3 3z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

// Short money: $9.6M, $250k, −$400k.
export const cash = (n: number) => {
  const a = Math.abs(n);
  const v = a >= 1_000_000 ? `${+(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `${Math.round(a / 1_000)}k` : String(a);
  return `${n < 0 ? '−' : ''}$${v}`;
};

// The budget (ILI-1405): what Castle House has left to spend this mission, a cell of the mission
// bar. Red once it's in the red.
function BudgetChip() {
  const budget = useGame((s) => s.resources.budget);
  return (
    <div className="mb-cell budget-chip" data-testid="budget-chip" data-red={budget < 0 || undefined} aria-label="Budget">
      <small className="t-label">Budget</small>
      <b data-testid="balance">{cash(budget)}</b>
    </div>
  );
}

// The mission's brief is on the satellite screen now, in ORION-3's tasking panel (ILI-1445): no
// start card blocks the game.
export const startText = (s: GameState) => `Recover the drone's black box at ${s.mission.b}`;

// The race (ILI-1245), for the debrief now (ILI-1392): the contract window used on top, ALPHA's
// walk A → B → C under it on the same scale.
export function RaceBar({ s }: { s: GameState }) {
  const r = race(s);
  const left = Math.max(0, Math.min(1, s.timer.remainingMs / Math.max(1, s.timer.totalMs)));
  return (
    <div className="race" data-testid="race" data-behind={r.behind}>
      <span className="race-time" role="progressbar" aria-label="Contract window left" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${left * 100}%` }} />
      </span>
      <span className="race-route" role="progressbar" aria-label={`${s.team.callsign}'s route walked`} aria-valuenow={Math.round(r.walked * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${r.walked * 100}%` }} />
      </span>
      <ol className="race-marks">
        {r.marks.map((m) => (
          <li key={m.key} style={{ left: `${m.at * 100}%` }} data-passed={r.walked >= m.at} title={`${m.key} · ${m.square}`}>
            {m.key}
          </li>
        ))}
      </ol>
    </div>
  );
}
