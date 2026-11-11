import { game, useGame } from '../sim/store';
import { race } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import type { GameState } from '../sim/state';

// The contract window counts down real minutes, M:SS, rounding up (ILI-1251): ten minutes reads
// 10:00.
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// The mission panel is broken up (ILI-1392). What's left on the HUD is tier one: the clock, small,
// in the map's corner, named for why it matters (the client's deadline), with pause beside it. The
// mission's name and objective are the start card and a marker on the map; ALPHA needing intel is
// a prompt (ILI-1391); the race is in the debrief.
export function TimerChip() {
  const timer = useGame((s) => s.timer);
  const phase = useGame((s) => s.phase);
  const tick = useGame((s) => s.tick);
  const mission = useGame((s) => s.mission);
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 300_000 ? 'amber' : undefined;
  return (
    <section className="timer-chip" data-testid="timer" data-phase={phase} data-warn={warn} data-overlay="widget" aria-label="Client deadline">
      <span className="t-label">Client deadline</span>
      <span className="clock" data-testid="clock" data-warn={warn}>
        {clock(remaining)}
      </span>
      <button className="pause" onClick={game.pause} disabled={phase !== 'running'} aria-label="Pause" data-testid="pause-toggle">
        ❚❚
      </button>
      <span className="sr-only" data-testid="tick">
        {tick}
      </span>
      {/* The objective is a marker on the map (ILI-1392); in words, for a screen reader. */}
      <span className="sr-only" data-testid="objective">
        {objectiveText(mission)}
      </span>
    </section>
  );
}

// Short money: $9.6M, $250k, −$400k.
export const cash = (n: number) => {
  const a = Math.abs(n);
  const v = a >= 1_000_000 ? `${+(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `${Math.round(a / 1_000)}k` : String(a);
  return `${n < 0 ? '−' : ''}$${v}`;
};

// The budget (ILI-1405), tier one beside the clock: what Castle House has left to spend this
// mission. Red once it's in the red.
export function BudgetChip() {
  const budget = useGame((s) => s.resources.budget);
  return (
    <section className="budget-chip" data-testid="budget-chip" data-red={budget < 0 || undefined} data-overlay="widget" aria-label="Budget">
      <span className="t-label">Budget</span>
      <b data-testid="balance">{cash(budget)}</b>
    </section>
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
