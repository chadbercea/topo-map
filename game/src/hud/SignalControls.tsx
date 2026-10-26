import { BAND, cipherText, LOCK_HOLD_MS, LOCK_WITHIN, strength } from '../sim/signal';
import { game, useGame } from '../sim/store';

// The intercept's controls in the companion panel: a dial with fine tuning, a signal meter
// and lock progress; then the cipher and its shift.
export function SignalControls() {
  const g = useGame((s) => s.minigame?.signal);
  if (!g) return null;
  if (g.phase === 'tune') {
    const inBand = Math.abs(g.dial - g.target) <= LOCK_WITHIN + 1e-9;
    const nudge = (d: number) => () => game.tune(g.dial + d);
    return (
      <div className="signal" data-testid="signal-tune">
        <div className="dial-row">
          <span className="freq" data-testid="freq">
            {g.dial.toFixed(1)} MHz
          </span>
          <span className="meter" role="meter" aria-label="Signal" aria-valuenow={Math.round(strength(g) * 100)}>
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} data-on={strength(g) * 10 > i} />
            ))}
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
        <div className="fine">
          <button onClick={nudge(-1)} aria-label="Down 1 MHz">◀◀</button>
          <button onClick={nudge(-0.1)} aria-label="Down 0.1 MHz">◀</button>
          <span className="lock">{inBand ? `LOCKING ${Math.round((g.lockMs / LOCK_HOLD_MS) * 100)}%` : 'SEARCHING'}</span>
          <button onClick={nudge(0.1)} aria-label="Up 0.1 MHz">▶</button>
          <button onClick={nudge(1)} aria-label="Up 1 MHz">▶▶</button>
        </div>
      </div>
    );
  }
  return (
    <div className="signal" data-testid="signal-decode">
      <p className="cipher" data-testid="cipher">
        {cipherText(g)}
      </p>
      <div className="fine">
        <button onClick={() => game.shiftCipher(-1)} aria-label="Shift back">◀ shift</button>
        <span className="lock">shift {g.guess}</span>
        <button onClick={() => game.shiftCipher(1)} aria-label="Shift forward">shift ▶</button>
        <button className="send" onClick={game.submitDecode}>Send</button>
      </div>
    </div>
  );
}
