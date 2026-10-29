import { game, useGame } from '../sim/store';
import { blockers, nextUp, phasePips, winChecks } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { gameSpan, zulu } from '../sim/gameTime';

// The contract window counts down real minutes, M:SS, rounding up (ILI-1251): ten minutes reads
// 10:00. The stamps beside it (Closes, Now) stay in the theater's game time.
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// MISSION · BLACK BOX (ILI-1226, layout A): the contract window and the mission in one panel,
// top left, a war-room readout like ENVIRONMENT (ILI-1234). The contract window first: its clock
// big, pause beside it, a bar running down with the time left (amber, then red, as the clock
// goes), and when it closes and what time it is now. Then the mission's phases as a track, what
// to do (objective, next), what's in the way (blockers) and the win conditions. On a fold it
// floats over the map's top-left corner; on a phone it's the panel on top, one tight block.
export function MissionPanel() {
  const s = useGame((x) => x);
  const { timer, phase, tick } = s;
  const now = s.elapsedMs;
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 300_000 ? 'amber' : undefined;
  const next = nextUp(s);
  const blocks = blockers(s);

  const left = Math.max(0, Math.min(1, remaining / Math.max(1, timer.totalMs)));

  return (
    <section className="panel mission" data-testid="mission-strip" data-phase={phase} data-warn={warn} data-overlay="widget">
      <h2 className="m-title">
        <span>{s.mission.name.replace('Operation ', '').toUpperCase()}</span>
        <span className="m-stamp">OPS · {zulu(now)}</span>
      </h2>
      <div className="m-head" data-testid="mission-timer" data-phase={phase}>
        <div className="m-readout">
          <span className="m-label">
            <ClockIcon />
            Contract window
          </span>
          <span className="clock" data-testid="clock" data-warn={warn}>
            {clock(remaining)}
          </span>
        </div>
        <button className="pause" onClick={game.pause} disabled={phase !== 'running'} aria-label="Pause" data-testid="pause-toggle">
          ❚❚
        </button>
        <span className="sr-only" data-testid="tick">
          {tick}
        </span>
      </div>
      <span className="m-decay" role="progressbar" aria-label="Contract window left" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${left * 100}%` }} />
      </span>
      <dl className="m-times">
        <div>
          <dt>Closes</dt>
          <dd>{zulu(timer.totalMs)}</dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd>{zulu(now)}</dd>
        </div>
      </dl>
      <ol className="pips" data-testid="phase-pips">
        {phasePips(s).map((p) => (
          <li key={p.key} data-state={p.state} title={p.label}>
            <span className="pip">{p.key}</span>
            <span className="pip-label">{p.label.slice(2)}</span>
            {p.detail && <span className="pip-detail">{p.detail}</span>}
          </li>
        ))}
      </ol>
      <p className="objective" data-testid="objective">
        ◆ {objectiveText(s.mission)}
      </p>
      <p className="next" data-testid="next" data-tone={next.tone}>
        Next: {next.text}
        {next.atMs !== undefined && ` · ${gameSpan(next.atMs - now)}`}
      </p>
      <ul className="blockers" data-testid="blockers" aria-label="Blockers">
        {blocks.length ? (
          blocks.slice(0, 3).map((b) => (
            <li key={b.text} data-tone={b.tone}>
              {b.text}
            </li>
          ))
        ) : (
          <li className="clear">Nothing in the way</li>
        )}
        {blocks.length > 3 && <li className="more">+{blocks.length - 3}</li>}
      </ul>
      <ul className="win" data-testid="win-checks" aria-label="Win conditions">
        {winChecks(s).map((w) => (
          <li key={w.key} data-done={w.done}>
            {w.done ? '■' : '□'} {w.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// A clock face, in the readout's line style (like ENVIRONMENT's icons).
const ClockIcon = () => (
  <svg className="env-icon" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </svg>
);
