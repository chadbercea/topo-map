import { game, useGame } from '../sim/store';

// Actions for the square HQ has selected on the map. For now: point the satellite at it.
export function SquareActions() {
  const selected = useGame((s) => s.map.selected);
  const scans = useGame((s) => s.resources.scans);
  const imaged = useGame((s) => !!s.map.selected && s.map.scanned.includes(s.map.selected));
  const busy = useGame((s) => !!s.minigame);
  if (!selected || busy) return null;
  return (
    <div className="panel square-actions" data-testid="square-actions">
      <span className="sq">{selected}</span>
      <span className="note">{imaged ? 'imaged' : 'no imagery'}</span>
      <button disabled={scans < 1} onClick={() => game.manualScan(selected)}>
        Scan ▸ {scans < 1 && <small>· no scans</small>}
      </button>
    </div>
  );
}
