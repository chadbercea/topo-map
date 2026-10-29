import { MINIGAMES, timeLeft } from '../sim/minigame';
import type { Weapon } from '../sim/ordnance';

const AIM: Record<Exclude<Weapon, 'drone'>, string> = {
  sniper: 'Tap a fighter you can see. One round, one fighter.',
  heli: 'Tap a row to strafe it end to end.',
};
const EYES = {
  live: 'Live: they are where you see them.',
  fresh: 'Fresh look: they should still be there.',
  ghost: 'Old look: they may have moved.',
  stale: 'Stale look: you are guessing.',
} as const;
import { WEAPON } from '../sim/ordnance';
import { SignalControls } from './SignalControls';
import { game, useGame } from '../sim/store';

// Companion panel for a mini game: what to do, the countdown and progress. No after-action
// panel (ILI-1204): when it's over it's gone, and the result is a report in the stream and
// comms. A strike's is in ORION-3's panel, under its picture (ILI-1250); the signal's floats
// over the map.
export function MiniGamePanel({ strike = false }: { strike?: boolean }) {
  const m = useGame((s) => s.minigame);
  const left = useGame(timeLeft);
  if (!m || m.status !== 'active' || (m.kind === 'seekDestroy') !== strike) return null;
  const def = MINIGAMES[m.kind];
  const seek = m.kind === 'seekDestroy';
  const title = seek ? `${WEAPON[m.weapon!].name.toUpperCase()} · ${m.square}` : `${def.title.toUpperCase()} · ${m.square}`;
  return (
    <section className="panel minigame" data-testid="minigame" data-status={m.status} role="dialog" aria-label={def.title}>
      <h2>{title}</h2>
      <p className="instructions">{seek ? AIM[m.weapon as Exclude<Weapon, 'drone'>] : def.instructions}</p>
      {seek && (
        <p className="eyes" data-testid="strike-eyes" data-eyes={m.eyes ?? 'none'}>
          {m.eyes ? EYES[m.eyes] : 'No eyes: a blind strike. Kills won\'t be confirmed or paid.'}
        </p>
      )}
      <div className="countdown">
        <span className="bar" role="timer" aria-label="Time left">
          <span style={{ width: `${(left / m.durationMs) * 100}%` }} />
        </span>
        <span className="secs">{(left / 1000).toFixed(1)}s</span>
      </div>
      {m.kind === 'signal' ? (
        <SignalControls />
      ) : (
        <p>
          <span data-testid="minigame-progress">{m.hits} down</span> · {m.roundsLeft} round{m.roundsLeft === 1 ? '' : 's'} left
        </p>
      )}
      <button onClick={game.abortMiniGame}>Abort</button>
    </section>
  );
}
