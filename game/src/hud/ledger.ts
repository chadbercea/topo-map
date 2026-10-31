import { game } from '../sim/store';
import { wrapUp } from '../sim/wrapup';

// Castle House's balance carries from mission to mission on this device (ILI-1316): saved when a
// mission ends, read back when the next one opens. Bankruptcy wipes it: a new PMC starts at zero.
// Storage can be missing (private mode), so fail quietly: the mission then opens at zero.
const KEY = 'pmc-war-room:balance';

export function loadBalance(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveBalance(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    // not kept; the next mission opens at zero
  }
}

// Watch for a mission's end and file its closing balance.
export function keepLedger() {
  let ended = false;
  game.subscribe(() => {
    const s = game.get();
    const now = s.phase === 'ended';
    if (now && !ended) saveBalance(s.bankrupt ? 0 : wrapUp(s).budget);
    ended = now;
  });
}
