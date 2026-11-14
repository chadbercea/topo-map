import { bus, EV } from '../game/events';
import { gameUiBoxes, pick, type Box } from './overlays';

type Area = { x: number; y: number; width: number; height: number };
const W = 96;
const H = 22;
const PAD = 8;

// An edge marker (ILI-1546): when an ALERT is off the open map or under a game UI panel, a small
// red chip sits on the open map's edge, pointing at its square. A tap pans the map there.
export function EdgeMarker({ square, target, area, label }: { square: string; target: { x: number; y: number }; area: Area; label: string }) {
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  // Where the line from the map's middle to the square meets the map's edge.
  const hw = area.width / 2 - PAD - W / 2;
  const hh = area.height / 2 - PAD - H / 2;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  const at = (x: number, y: number): Box => ({ x: x - W / 2, y: y - H / 2, w: W, h: H });
  const spots = [at(cx + dx * t, cy + dy * t), at(cx, area.y + PAD + H / 2), at(area.x + area.width - PAD - W / 2, cy), at(cx, area.y + area.height - PAD - H / 2), at(area.x + PAD + W / 2, cy)];
  const box = pick(spots, gameUiBoxes());
  const angle = Math.round((Math.atan2(target.y - (box.y + H / 2), target.x - (box.x + W / 2)) * 180) / Math.PI);
  return (
    <button className="edge-marker" data-testid="edge-marker" data-square={square} style={{ left: box.x, top: box.y, width: W, height: H }} onClick={() => bus.emit(EV.panTo, square)} aria-label={`${label} ${square}: show on the map`}>
      <i aria-hidden style={{ transform: `rotate(${angle}deg)` }}>➤</i>
      <b>{label}</b> {square}
    </button>
  );
}
