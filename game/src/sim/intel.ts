import type { GameState } from './state';
import type { System } from './systems';
import type { Message } from './comms';

// Analysts work the intel the PMC already has (GDD: up to three projects at once, one per
// type). Analyst count sets the speed; mini games speed up their matching type. Finished
// intel waits for HQ to send it to the team, where it lands as a buff.

export type IntelType = 'imagery' | 'target' | 'signals';
export const INTEL_TYPES: IntelType[] = ['imagery', 'target', 'signals'];

export type Project = { id: string; type: IntelType; title: string; progress: number; durationMs: number };
export type Buff = { kind: IntelType; title: string; untilMs: number };

export type Intel = {
  analysts: number;
  projects: Record<IntelType, Project | null>;
  queue: { atMs: number; project: Omit<Project, 'progress'> }[]; // intel still to come in
  sent: string[]; // project ids already sent to the team
};

export const BASE_ANALYSTS = 3;
const BUFF_MS = 90_000;

// What each type does for the team once it's sent.
export const BUFF_EFFECT: Record<IntelType, string> = {
  imagery: 'Route known: moves 20% faster',
  target: 'Targets known: 30% more accurate in fights',
  signals: 'Enemy net read: takes 30% less damage',
};

export const initialIntel = (feed: Intel['queue']): Intel => ({
  analysts: BASE_ANALYSTS,
  projects: { imagery: null, target: null, signals: null },
  queue: feed,
  sent: [],
});

export const ready = (p: Project | null) => !!p && p.progress >= 1;

export const intelSystem: System = (s, dt) => {
  const { intel } = s;
  const projects = { ...intel.projects };
  let queue = intel.queue;
  let changed = false;

  // Intel comes in and takes its type's slot when the slot is free.
  for (const item of intel.queue) {
    if (item.atMs > s.elapsedMs || projects[item.project.type]) continue;
    projects[item.project.type] = { ...item.project, progress: 0 };
    queue = queue.filter((q) => q !== item);
    changed = true;
  }

  // Analysts split their time across the projects still in progress.
  const working = INTEL_TYPES.filter((t) => projects[t] && !ready(projects[t]));
  for (const t of working) {
    const pr = projects[t]!;
    const rate = (intel.analysts / BASE_ANALYSTS) * (dt / pr.durationMs);
    projects[t] = { ...pr, progress: Math.min(1, pr.progress + rate) };
    changed = true;
  }

  return changed ? { ...s, intel: { ...intel, projects, queue } } : s;
};

// A mini game won for this type: its project jumps ahead.
export function boostIntel(s: GameState, type: IntelType, amount = 0.25): GameState {
  const pr = s.intel.projects[type];
  if (!pr || ready(pr)) return s;
  return { ...s, intel: { ...s.intel, projects: { ...s.intel.projects, [type]: { ...pr, progress: Math.min(1, pr.progress + amount) } } } };
}

// HQ sends finished intel to the team: the slot frees up and the team gets the buff.
export function sendIntel(s: GameState, type: IntelType): GameState {
  const pr = s.intel.projects[type];
  if (!pr || !ready(pr)) return s;
  const buff: Buff = { kind: type, title: pr.title, untilMs: s.elapsedMs + BUFF_MS };
  const ack: Message = {
    id: `intel-${pr.id}`,
    from: s.team.callsign,
    text: `Got the ${pr.title.toLowerCase()}. ${BUFF_EFFECT[type].split(':')[0]}.`,
    atMs: s.elapsedMs,
    status: 'read',
    holds: false,
  };
  return {
    ...s,
    intel: { ...s.intel, projects: { ...s.intel.projects, [type]: null }, sent: [...s.intel.sent, pr.id] },
    team: { ...s.team, buffs: [...s.team.buffs.filter((b) => b.kind !== type), buff] },
    comms: { ...s.comms, messages: [...s.comms.messages, ack] },
  };
}

export const hasBuff = (s: GameState, kind: IntelType) => s.team.buffs.some((b) => b.kind === kind && b.untilMs > s.elapsedMs);
