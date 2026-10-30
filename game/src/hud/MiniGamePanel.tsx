import { MINIGAMES, timeLeft } from '../sim/minigame';
import { SignalControls } from './SignalControls';
import { game, useGame } from '../sim/store';

// Companion panel for the mini game (the signal intercept, ILI-1169): what to do, the countdown,
// and its controls. No after-action panel (ILI-1204): when it's over it's gone, and the result
// is a report in the stream and comms. Strikes have no mini game: they're automated (air.ts,
// sniper.ts).
export function MiniGamePanel() {
  const m = useGame((s) => s.minigame);
  const left = useGame(timeLeft);
  if (!m || m.status !== 'active') return null;
  const def = MINIGAMES[m.kind];
  return (
    <section className="panel minigame" data-testid="minigame" data-status={m.status} role="dialog" aria-label={def.title}>
      <h2>{`${def.title.toUpperCase()} · ${m.square}`}</h2>
      <p className="instructions">{def.instructions}</p>
      <div className="countdown">
        <span className="bar" role="timer" aria-label="Time left">
          <span style={{ width: `${(left / m.durationMs) * 100}%` }} />
        </span>
        <span className="secs">{(left / 1000).toFixed(1)}s</span>
      </div>
      <SignalControls />
      <button onClick={game.abortMiniGame}>Abort</button>
    </section>
  );
}
