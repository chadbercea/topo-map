import { game, useGame } from '../sim/store';
import { satelliteBusy, slewMs } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { gameSpan } from '../sim/gameTime';

// Actions for the square HQ has selected on the map: task ORION-3 to look at it. The button
// shows how long the satellite needs to get there from where it's looking now.
export function SquareActions() {
  const selected = useGame((s) => s.map.selected);
  const travel = useGame((s) => (s.map.selected ? slewMs(s, s.map.selected) : 0));
  const busy = useGame(satelliteBusy);
  const seen = useGame((s) => {
    const snap = s.map.selected ? s.imagery[s.map.selected] : undefined;
    return snap ? freshness(snap, s.elapsedMs) : null;
  });
  const playing = useGame((s) => !!s.minigame);
  if (!selected || playing) return null;
  return (
    <div className="panel square-actions" data-testid="square-actions">
      <span className="sq">{selected}</span>
      <span className="note">{seen ? `imagery ${seen}` : 'no imagery'}</span>
      <button disabled={busy} onClick={() => game.lookAt(selected)} data-testid="look-here">
        Look · {travel ? gameSpan(travel) : 'now'} {busy && <small>· ORION-3 busy</small>}
      </button>
    </div>
  );
}
