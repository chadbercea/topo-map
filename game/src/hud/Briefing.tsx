import { useEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { clock } from './MissionBar';

// The briefing (ILI-1176): the plan before the clock starts. The map shows the route behind
// it; nothing moves until Go.
export function Briefing() {
  const briefing = useGame((s) => s.phase === 'briefing');
  const mission = useGame((s) => s.mission);
  const totalMs = useGame((s) => s.timer.totalMs);
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), [briefing]);
  if (!briefing) return null;

  return (
    <div className="overlay briefing-overlay" data-testid="briefing">
      <section className="panel menu briefing" role="dialog" aria-label="Briefing">
        <div className="eyebrow">Briefing · {mission.name}</div>
        <p className="lead">
          A recon drone went down at the crash site in {mission.b}. Recover its black box before the enemy does, and get ALPHA out.
        </p>
        <ol className="plan">
          <li>
            <b>A</b> Infil at {mission.a}
          </li>
          <li>
            <b>B</b> Recover the black box at {mission.b}
          </li>
          <li>
            <b>C</b> Exfil at {mission.c}
          </li>
        </ol>
        <p>
          <span className="tag">Intel</span> Nothing confirmed. The ground between {mission.a} and {mission.b} hasn’t been imaged. Expect enemy around
          the town.
        </p>
        <dl className="tools">
          <div>
            <dt>Look</dt>
            <dd>Task ORION-3 to a square. Tap the square, then Look.</dd>
          </div>
          <div>
            <dt>Strike</dt>
            <dd>Hit a contact you can see. Drone (one use) or sniper.</dd>
          </div>
          <div>
            <dt>Listen</dt>
            <dd>Listen in on enemy radio when HQ picks it up.</dd>
          </div>
          <div>
            <dt>Move</dt>
            <dd>Moves along the route and holds when it needs your call. It waits for orders.</dd>
          </div>
        </dl>
        <p className="window">
          Contract window <b>{clock(totalMs)}</b>. It starts when you go.
        </p>
        <button ref={go} className="go" onClick={game.go} data-testid="go">
          Go
        </button>
      </section>
    </div>
  );
}
