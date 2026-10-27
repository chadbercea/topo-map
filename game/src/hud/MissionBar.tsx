import { game, useGame } from '../sim/store';
import { blockers, nextUp, phasePips, winChecks } from '../sim/progress';
import { objectiveText } from '../sim/mission';
import { groundInView, weather } from '../sim/conditions';
import { gameClock, gameSpan, zulu } from '../sim/gameTime';
import { liveAlerts } from '../sim/comms';
import { LABEL } from './EventCard';

export const clock = (ms: number) => gameClock(ms);

// The mission header (ILI-1187): the anchor for the mission. At a glance it answers what to
// do (objective, next), how far along it is (phases, win conditions), what's in the way
// (blockers), what the ground and weather are like where HQ is looking, and the deadline.
// Everything else lives in its own panel: ALPHA and its calls bottom right (ILI-1186), the
// assets by the map's tools.
export function MissionBar() {
  const s = useGame((x) => x);
  const { timer, phase, tick, elapsedMs: now } = s;
  const next = nextUp(s);
  const blocks = blockers(s);
  // New on the map (ILI-1189): each event nobody has opened yet, at the front of the
  // blockers; tapping one opens its card beside its square. HQ's news the map can't show
  // flashes here for a moment too (it stays in the intel stream).
  const fresh = s.events.filter((e) => e.status === 'new');
  const news = liveAlerts(s.comms, now);
  const wx = weather(s);
  const area = groundInView(s);
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 180_000 ? 'amber' : undefined;

  return (
    <section className="panel bar-top" data-testid="mission-timer" data-phase={phase}>
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
          {fresh.map((e) => (
            <li key={e.id} className="event" data-kind={e.kind}>
              <button onClick={() => game.openEvent(e.id)} data-testid="new-event">
                {LABEL[e.kind]} {e.square} · {e.title}
              </button>
            </li>
          ))}
          {news.map((m) => (
            <li key={m.id} className="news" data-tone="threat" data-testid="banner">
              {m.from}: {m.text}
            </li>
          ))}
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

      <div className="hdr-area" data-testid="conditions">
        <p className="wx" data-testid="weather">
          <b>WX</b> {wx.sky} · vis {wx.visibilityKm} km · wind {wx.wind.from} {wx.wind.kmh} km/h · {wx.tempC}°C · {wx.light}
        </p>
        <p className="ground" data-testid="ground">
          {area ? (
            <>
              <b>{area.square}</b> {area.lowM}–{area.highM} m · {area.slope}
              {area.features.map((f) => ` · ${f}`)} · {area.imagery}
              {area.contacts > 0 && <span className="contacts"> · {area.contacts} contact{area.contacts > 1 && 's'}</span>}
            </>
          ) : (
            <>
              <b>AO</b> 4 × 2.5 km · 500 m squares · tap a square for its ground
            </>
          )}
        </p>
      </div>

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
    </section>
  );
}
