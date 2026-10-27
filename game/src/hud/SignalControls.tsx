import { BAND, match, PLAN_AT, RECEIVING, transcript, type Signal } from '../sim/signal';
import { game, useGame } from '../sim/store';

const W = 300;
const H = 56;

// A frequency drawn as a wave: higher frequencies pack more cycles into the strip.
function wave(mhz: number, phase: number) {
  const cycles = 2 + ((mhz - BAND.min) / (BAND.max - BAND.min)) * 7;
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 3) pts.push(`${x},${(H / 2 + Math.sin((x / W) * cycles * Math.PI * 2 + phase) * (H / 2 - 6)).toFixed(1)}`);
  return pts.join(' ');
}

// The intercept (ILI-1169): their wave and HQ's, one slider to lay one over the other, how
// well they match, and the transcript filling in while they do.
export function SignalControls() {
  const g = useGame((s) => s.minigame?.signal) as Signal | undefined;
  const now = useGame((s) => s.elapsedMs);
  if (!g) return null;
  const m = match(g);
  const receiving = m >= RECEIVING;
  const phase = now / 400;
  return (
    <div className="signal" data-testid="signal-tune" data-receiving={receiving}>
      <svg className="waves" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <polyline className="theirs" points={wave(g.target, phase)} />
        <polyline className="yours" points={wave(g.dial, phase)} />
      </svg>
      <div className="dial-row">
        <span className="legend">
          <i className="theirs" /> theirs <i className="yours" /> yours
        </span>
        <span className="match" data-testid="match" role="meter" aria-label="Match" aria-valuenow={Math.round(m * 100)}>
          {receiving ? 'RECEIVING' : 'MATCH'} {Math.round(m * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={BAND.min}
        max={BAND.max}
        step={0.1}
        value={g.dial}
        onChange={(e) => game.tune(Number(e.target.value))}
        aria-label="Frequency"
        data-testid="dial"
      />
      <p className="transcript" data-testid="transcript">
        “{transcript(g)}
        <span className="caret">▌</span>
      </p>
      <span className="bar progress" role="progressbar" aria-label="Message received" aria-valuenow={Math.round(g.progress * 100)}>
        <span style={{ width: `${g.progress * 100}%` }} />
        <i className="mark" style={{ left: `${PLAN_AT * 100}%` }} title="Enough to learn their plan" />
      </span>
    </div>
  );
}
