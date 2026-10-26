import { MINIGAMES, timeLeft } from '../sim/minigame';
import { WEAPON } from '../sim/ordnance';
import { game, useGame } from '../sim/store';

// Companion panel for the mini game on the map: what to do, the countdown, progress, and
// the result once it's over.
export function MiniGamePanel() {
  const m = useGame((s) => s.minigame);
  const left = useGame(timeLeft);
  if (!m) return null;
  const def = MINIGAMES[m.kind];
  const active = m.status === 'active';
  const seek = m.kind === 'seekDestroy';
  const title = seek ? `${WEAPON[m.weapon!].name.toUpperCase()} · ${m.square}` : `${def.title.toUpperCase()} · ${m.square}`;
  return (
    <section className="panel minigame" data-testid="minigame" data-status={m.status} role="dialog" aria-label={def.title}>
      <h2>{title}</h2>
      {active ? (
        <>
          <p className="instructions">{def.instructions}</p>
          <div className="countdown">
            <span className="bar" role="timer" aria-label="Time left">
              <span style={{ width: `${(left / m.durationMs) * 100}%` }} />
            </span>
            <span className="secs">{(left / 1000).toFixed(1)}s</span>
          </div>
          {seek ? (
            <p>
              <span data-testid="minigame-progress">{m.hits} down</span> · {m.roundsLeft} round{m.roundsLeft === 1 ? '' : 's'} left
              {m.weapon === 'drone' ? ' · 2×2 blast' : ''}
            </p>
          ) : (
            <p>
              <span data-testid="minigame-progress">
                {m.hits}/{m.targets.length}
              </span>{' '}
              squares{m.misses ? ` · ${m.misses} miss${m.misses > 1 ? 'es' : ''} (−${m.misses}s)` : ''}
            </p>
          )}
          <button onClick={game.abortMiniGame}>Abort</button>
        </>
      ) : (
        <>
          <p className="result" data-testid="minigame-result">
            {seek
              ? m.status === 'won'
                ? `Target destroyed. ${m.hits} down.`
                : `${m.hits} down. The rest are still in ${m.square}.`
              : m.status === 'won'
                ? 'Scan complete. Imagery sent to the team.'
                : 'Scan failed. The team moves without it.'}
          </p>
          <button onClick={game.closeMiniGame}>Close</button>
        </>
      )}
    </section>
  );
}
