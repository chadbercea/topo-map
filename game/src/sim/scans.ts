import type { GameState } from './state';
import type { System } from './systems';
import { startMiniGame } from './minigame';

// The satellite is a shared, limited pool (GDD): team requests and HQ's own hunting draw
// from the same scans. It recharges one scan at a time up to its capacity.

export const MAX_SCANS = 3;
export const RECHARGE_MS = 45_000;

export const scanSystem: System = (s) => {
  const { scans, rechargeAtMs } = s.resources;
  if (scans >= MAX_SCANS) return rechargeAtMs === null ? s : { ...s, resources: { ...s.resources, rechargeAtMs: null } };
  if (rechargeAtMs === null) return { ...s, resources: { ...s.resources, rechargeAtMs: s.elapsedMs + RECHARGE_MS } };
  if (s.elapsedMs < rechargeAtMs) return s;
  const next = scans + 1;
  return { ...s, resources: { ...s.resources, scans: next, rechargeAtMs: next < MAX_SCANS ? s.elapsedMs + RECHARGE_MS : null } };
};

// HQ points the satellite at a square on its own initiative.
export function manualScan(s: GameState, square: string): GameState {
  if (s.resources.scans < 1 || s.minigame?.status === 'active') return s;
  const spent = { ...s, resources: { ...s.resources, scans: s.resources.scans - 1 }, map: { ...s.map, selected: null } };
  return startMiniGame(spent, 'gridScan', square);
}
