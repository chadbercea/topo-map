import { game, useGame } from '../sim/store';
import { bus, EV } from '../game/events';
import { blockers, nextUp, race, type Blocker } from '../sim/progress';
import { objectiveText } from '../sim/mission';

// The contract window counts down real minutes, M:SS, rounding up (ILI-1251): ten minutes reads
// 10:00.
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// MISSION · BLACK BOX (ILI-1226, layout A; reworked as the race, ILI-1245): the contract window
// drives the game, so the clock comes first and big, with pause beside it. Under it the race:
// time left drains on the top bar, ALPHA's walk A → B → C fills the one below on the same
// scale, so a glance says whether the team will make it. When the walk left needs more than the
// time left, the route bar goes red. Then the objective, and the one thing that needs HQ most.
// One unit of time on the panel, real minutes; the Zulu stamps live on ENVIRONMENT.
export function MissionPanel() {
  const s = useGame((x) => x);
  const { timer, phase, tick, mission } = s;
  const remaining = timer.remainingMs;
  const warn = remaining <= 60_000 ? 'red' : remaining <= 300_000 ? 'amber' : undefined;
  const left = Math.max(0, Math.min(1, remaining / Math.max(1, timer.totalMs)));
  const r = race(s);
  const need = needsHq(s);
  const recovering = mission.phase === 'objective' && mission.recoverUntilMs !== null ? ` · ${clock(mission.recoverUntilMs - s.elapsedMs)}` : '';

  return (
    <section className="panel mission" data-testid="mission-strip" data-phase={phase} data-warn={warn} data-overlay="widget">
      <h2 className="m-title">{mission.name.replace('Operation ', '').toUpperCase()}</h2>
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
      <p className="objective" data-testid="objective">
        ◆ {objectiveText(mission)}
        {recovering}
      </p>
      {need && 'go' in need && need.go ? (
        // A tap goes to what it's about (ILI-1271): the square on the map, or ALPHA's call.
        <button className="need" data-testid="needs-hq" data-tone={need.tone} onClick={() => go(need.go!)}>
          {need.text}
        </button>
      ) : (
        <p className="need" data-testid="needs-hq" data-tone={need?.tone}>
          {need ? need.text : 'Nothing in the way'}
        </p>
      )}
    </section>
  );
}

function go(to: NonNullable<Blocker['go']>) {
  if (to.square) game.selectSquare(to.square);
  if (to.ask) bus.emit(EV.openAsk);
}

// The one thing that needs HQ most: what's in the way now, else a threat or resupply on its way.
function needsHq(s: Parameters<typeof blockers>[0]) {
  const now = blockers(s)[0];
  if (now) return now;
  const next = nextUp(s);
  if (next.tone === 'objective') return undefined;
  return { tone: next.tone, text: next.atMs === undefined ? next.text : `${next.text} in ${clock(next.atMs - s.elapsedMs)}` };
}

// A clock face, in the readout's line style (like ENVIRONMENT's icons).
const ClockIcon = () => (
  <svg className="env-icon" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </svg>
);
