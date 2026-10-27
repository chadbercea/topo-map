import { waitingCalls } from './comms';
import { missionDef } from './script';
import type { GameState } from './state';

// Mission progression at a glance (ILI-1173): where the mission is (phase pips), what ALPHA
// is doing now, and the one thing that presses next. Pure reads of the state, for the HUD.

export type Pip = { key: string; label: string; state: 'done' | 'current' | 'todo'; detail?: string };

const ORDER = ['infil', 'objective', 'exfil'] as const;

export function phasePips(s: GameState): Pip[] {
  const { mission } = s;
  const at = mission.phase === 'complete' ? ORDER.length : ORDER.indexOf(mission.phase);
  const pips: Pip[] = [
    { key: 'A', label: `A infil ${mission.a}` },
    { key: 'B', label: `B crash site ${mission.b}` },
    { key: 'C', label: `C exfil ${mission.c}` },
  ].map((p, i) => ({ ...p, state: i < at ? 'done' : i === at ? 'current' : 'todo' }));
  if (mission.phase === 'objective' && mission.recoverUntilMs !== null)
    pips[1].detail = `recovering ${Math.ceil((mission.recoverUntilMs - s.elapsedMs) / 1000)}s`;
  return pips;
}

export type Pressing = { tone: 'call' | 'threat' | 'support' | 'objective'; text: string; atMs?: number };

// The single most pressing thing, in this order: a decision waiting, a known threat with
// an ETA, support inbound, else the objective itself.
export function nextUp(s: GameState): Pressing {
  const calls = waitingCalls(s.comms);
  if (calls.length) {
    const c = calls.find((m) => m.holds) ?? calls[0];
    return { tone: 'call', text: `${c.from} needs a decision` };
  }
  const threat = missionDef(s.script.mission)
    ?.threats?.(s)
    .filter((t) => t.atMs > s.elapsedMs)
    .sort((a, b) => a.atMs - b.atMs)[0];
  if (threat) return { tone: 'threat', ...threat };
  const inbound = [...s.inbound].sort((a, b) => a.arrivesMs - b.arrivesMs)[0];
  if (inbound) return { tone: 'support', text: 'Resupply lands', atMs: inbound.arrivesMs };
  const { mission } = s;
  const text =
    mission.phase === 'infil' ? `Reach the crash site at ${mission.b}` : mission.phase === 'objective' ? `Hold ${mission.b} while the drive comes out` : `Get to exfil at ${mission.c}`;
  return { tone: 'objective', text };
}
