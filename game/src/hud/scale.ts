// The HUD grows with the map's squares on a wide screen (ILI-1498). At 1440×900 a map square is
// about 149 px and ORION-3's 298 px picture is twice its side, four times its area: that is the
// size Chad signed off. On a bigger screen the squares grow, so ORION-3's column and the square's
// flyout grow with them, keeping that ratio. Never smaller than at 1440×900, at most double.
// The phone and fold layouts don't use it: they size to their own sheets.

const PICTURE = 298; // ORION-3's picture at scale 1 (its 300 px column inside a 1 px border)
const MAX = 2;

let k = 1;
export const uiScale = () => k;

// cellPx: one map square's side on screen, in CSS px.
export function setCellSize(cellPx: number) {
  const next = Math.min(MAX, Math.max(1, (2 * cellPx) / PICTURE));
  if (Math.abs(next - k) < 0.005) return;
  k = next;
  document.documentElement.style.setProperty('--k', next.toFixed(3));
}
