import { MINIGAMES, timeLeft } from '../sim/minigame';
import type { Weapon } from '../sim/ordnance';
import { WHERE_AT } from '../sim/signal';

const AIM: Record<Weapon, string> = {
  sniper: 'Tap a fighter you can see. One round, one fighter.',
  drone: 'Tap where to put the blast: it hits a 2×2 block.',
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
          <p className="instructions">{seek ? AIM[m.weapon!] : def.instructions}</p>
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
        </>
      ) : (
        <>
          <p className="result" data-testid="minigame-result">
            {m.kind === 'signal'
              ? m.status === 'won'
                ? `Decoded: “${m.signal!.plain}”`
                : m.signal!.progress >= WHERE_AT
                  ? `Got part of it: they're at ${m.square}, but not what they plan.`
                  : 'Lost it. The traffic went quiet.'
              : m.status === 'won'
                ? `Target destroyed. ${m.hits} down.`
                : `${m.hits} down. The rest are still in ${m.square}.`}
          </p>
          <div className="actions">
            {m.kind === 'signal' && m.signal!.progress >= WHERE_AT && (
              <button
                onClick={() => {
                  game.closeMiniGame();
                  game.lookAt(m.square);
                }}
                data-testid="look-at-signal"
              >
                Look at {m.square}
              </button>
            )}
            <button onClick={game.closeMiniGame}>Close</button>
          </div>
        </>
      )}
    </section>
  );
}
