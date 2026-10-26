import { HOLD_TIMEOUT_MS, waitingCalls, type Message } from './comms';
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
  const job = s.sideJob;
  if (job && (job.status === 'active' || job.status === 'done' || job.status === 'failed'))
    pips.push({
      key: '$',
      label: `side job ${job.square}`,
      state: job.status === 'active' ? 'current' : 'done',
      detail: job.status === 'active' && job.deadlineMs !== null ? `${Math.ceil((job.deadlineMs - s.elapsedMs) / 1000)}s` : job.status,
    });
  return pips;
}

// When a waiting call stops waiting: a hold times out (the team pushes on), the client's
// offer lapses. Other calls wait as long as it takes.
export function callDeadline(s: GameState, m: Message): number | null {
  if (m.holds && m.id === s.team.holdFor) return m.atMs + HOLD_TIMEOUT_MS;
  if (m.id === 'client-offer' && s.sideJob?.status === 'offered') return s.sideJob.offerUntilMs;
  return null;
}

export type Pressing = { tone: 'call' | 'threat' | 'job' | 'support' | 'objective'; text: string; atMs?: number };

// The single most pressing thing, in this order: a decision waiting, a known threat with
// an ETA, the side job's deadline, support inbound, else the objective itself.
export function nextUp(s: GameState): Pressing {
  const calls = waitingCalls(s.comms);
  if (calls.length) {
    const c = calls.find((m) => m.holds) ?? calls[0];
    return { tone: 'call', text: `${c.from} needs a decision`, atMs: callDeadline(s, c) ?? undefined };
  }
  const threat = missionDef(s.script.mission)
    ?.threats?.(s)
    .filter((t) => t.atMs > s.elapsedMs)
    .sort((a, b) => a.atMs - b.atMs)[0];
  if (threat) return { tone: 'threat', ...threat };
  const job = s.sideJob;
  if (job?.status === 'active' && job.deadlineMs !== null) return { tone: 'job', text: `Side job: imagery of ${job.square}`, atMs: job.deadlineMs };
  const inbound = [...s.inbound].sort((a, b) => a.arrivesMs - b.arrivesMs)[0];
  if (inbound) return { tone: 'support', text: inbound.kind === 'resupply' ? 'Resupply lands' : 'Reinforcements land', atMs: inbound.arrivesMs };
  const { mission } = s;
  const text =
    mission.phase === 'infil' ? `Reach the crash site at ${mission.b}` : mission.phase === 'objective' ? `Hold ${mission.b} while the drive comes out` : `Get to exfil at ${mission.c}`;
  return { tone: 'objective', text };
}
