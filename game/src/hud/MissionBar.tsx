import { game, useGame } from '../sim/store';
import { blockers, nextUp, phasePips, winChecks } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { weather } from '../sim/conditions';
import { satelliteStatus } from '../sim/satellite';
import { gameClock, gameSpan, zulu } from '../sim/gameTime';

export const clock = (ms: number) => gameClock(ms);

// The mission's status, split in two (ILI-1216). The status widget sits in the map's top-right
// corner: the contract window's clock and pause, then the weather and ORION-3. A square's ground
// is on its card (ILI-1220). The mission strip runs along the foot of the map: the mission and its
// phases, the win conditions, what to do (objective, next) and what's in the way (blockers).
// Everything else lives in its own panel: ALPHA and its calls bottom right (ILI-1186), the
// assets by the map's tools.
export function StatusWidget() {
  const s = useGame((x) => x);
  const { timer, phase, tick } = s;
  const wx = weather(s);
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 180_000 ? 'amber' : undefined;

  return (
    <section className="panel status-widget" data-testid="mission-timer" data-phase={phase} data-overlay="widget">
      <div className="hdr-deadline">
        <span className="label">CONTRACT WINDOW</span>
        <span className="clock" data-testid="clock" data-warn={warn}>
          {clock(remaining)}
        </span>
        <span className="when">{`closes ${zulu(timer.totalMs)} · now ${zulu(s.elapsedMs)}`}</span>
      </div>
      <button className="pause" onClick={game.pause} disabled={phase !== 'running'} aria-label="Pause" data-testid="pause-toggle">
        ❚❚
      </button>
      <span className="sr-only" data-testid="tick">
        {tick}
      </span>
      <div className="hdr-area" data-testid="conditions">
        <p className="wx" data-testid="weather">
          <b>WX</b> {wx.sky} · vis {wx.visibilityKm} km · wind {wx.wind.from} {wx.wind.kmh} km/h · {wx.tempC}°C · {wx.light}
        </p>
        <p className="sat" data-testid="satellite" data-state={s.satellite.state} aria-label="ORION-3 imaging satellite">
          <b>SAT</b> <span data-testid="satellite-status">{s.minigame?.status === 'active' ? 'ORION-3 · tied up' : satelliteStatus(s)}</span>
        </p>
      </div>
    </section>
  );
}

export function MissionStrip() {
  const s = useGame((x) => x);
  const now = s.elapsedMs;
  const next = nextUp(s);
  const blocks = blockers(s);

  return (
    <section className="panel mission-strip" data-testid="mission-strip">
      <div className="hdr-mission">
        <h2>{s.mission.name.replace('Operation ', '').toUpperCase()}</h2>
        {(
          <>
            <ol className="pips" data-testid="phase-pips">
              {phasePips(s).map((p) => (
                <li key={p.key} data-state={p.state} title={p.label}>
                  <span className="pip">{p.key}</span>
                  <span className="pip-label">{p.label.slice(2)}</span>
                  {p.detail && <span className="pip-detail">{p.detail}</span>}
                </li>
              ))}
            </ol>
            <ul className="win" data-testid="win-checks" aria-label="Win conditions">
              {winChecks(s).map((w) => (
                <li key={w.key} data-done={w.done}>
                  {w.done ? '■' : '□'} {w.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="hdr-task">
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
      </div>
    </section>
  );
}
