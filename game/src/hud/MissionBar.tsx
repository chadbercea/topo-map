import { game, useGame } from '../sim/store';
import { blockers, nextUp, phasePips, winChecks } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { weather } from '../sim/conditions';
import { gameClock, gameSpan, zulu } from '../sim/gameTime';

export const clock = (ms: number) => gameClock(ms);

// MISSION · BLACK BOX (ILI-1226, layout A): the contract window and the mission in one panel,
// top left. The clock and pause beside the mission's name, then its phases, what to do
// (objective, next), what's in the way (blockers) and the win conditions. On a fold it floats
// over the map's top-left corner; on a phone it's the line on top. A square's ground is on its
// card (ILI-1220); the weather and HQ's money are small widgets along the bottom.
export function MissionPanel() {
  const s = useGame((x) => x);
  const { timer, phase, tick } = s;
  const now = s.elapsedMs;
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 180_000 ? 'amber' : undefined;
  const next = nextUp(s);
  const blocks = blockers(s);

  return (
    <section className="panel mission" data-testid="mission-strip" data-phase={phase} data-overlay="widget">
      <div className="m-head" data-testid="mission-timer" data-phase={phase}>
        <h2>{s.mission.name.replace('Operation ', '').toUpperCase()}</h2>
        <span className="clock" data-testid="clock" data-warn={warn}>
          {clock(remaining)}
        </span>
        <button className="pause" onClick={game.pause} disabled={phase !== 'running'} aria-label="Pause" data-testid="pause-toggle">
          ❚❚
        </button>
        <span className="sr-only" data-testid="tick">
          {tick}
        </span>
      </div>
      <p className="when">{`Contract window · closes ${zulu(timer.totalMs)} · now ${zulu(now)}`}</p>
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

// Environment (ILI-1226): a small widget along the bottom. ILI-1218 makes it a table.
export function EnvWidget() {
  const wx = weather(useGame((x) => x)); // weather() builds a new object: select the state, not it
  return (
    <section className="panel small-widget env" data-testid="conditions" aria-label="Environment">
      <h2>ENVIRONMENT</h2>
      <p className="wx" data-testid="weather">
        {wx.sky} · vis {wx.visibilityKm} km · wind {wx.wind.from} {wx.wind.kmh} km/h · {wx.tempC}°C · {wx.light}
      </p>
    </section>
  );
}
