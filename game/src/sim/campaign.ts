import { initialState, type GameState } from './state';
import { unlockedWeapons } from './ordnance';
import { wrapUp } from './wrapup';

// The next contract (ILI-1566): a new rolled map (the next seed), opening on the closing balance,
// with the operators who came home, healed. Replacements a resupply brought in count; the dead don't.
export function nextContract(s: GameState): GameState {
  const w = wrapUp(s);
  const roles = s.team.operators.filter((o) => o.health > 0).map((o) => o.role);
  return initialState(s.settings, s.timer.totalMs, w.budget, unlockedWeapons(s), s.upgrades, (s.seed + 1) >>> 0, { contract: s.campaign.contract + 1, roles });
}
