import { initialState, type GameState } from './state';
import { unlockedWeapons } from './ordnance';
import { wrapUp } from './wrapup';
import { roster } from './team';
import { HIRE_COST } from './prices';

// Operators short of a full team after this contract: the dead, and anyone lost before it.
export const missing = (s: GameState) => roster().length - s.team.operators.filter((o) => o.health > 0).length;
export const hireCost = (s: GameState) => missing(s) * HIRE_COST;
// Hiring is offered when someone's missing and the closing balance covers it (ILI-1568).
export const canHire = (s: GameState) => missing(s) > 0 && wrapUp(s).budget >= hireCost(s);

// The next contract (ILI-1566): a new rolled map (the next seed), opening on the closing balance,
// with the operators who came home, healed. Replacements a resupply brought in count; the dead don't.
// hire (ILI-1568): HQ pays HIRE_COST for each operator missing and the team opens at full strength.
export function nextContract(s: GameState, hire = false): GameState {
  const w = wrapUp(s);
  const hiring = hire && canHire(s);
  const roles = hiring ? roster().map((o) => o.role) : s.team.operators.filter((o) => o.health > 0).map((o) => o.role);
  const budget = hiring ? w.budget - hireCost(s) : w.budget;
  return initialState(s.settings, s.timer.totalMs, budget, unlockedWeapons(s), s.upgrades, (s.seed + 1) >>> 0, { contract: s.campaign.contract + 1, roles });
}
