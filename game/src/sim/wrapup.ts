import type { GameState } from './state';

// The wrap-up (GDD): win needs mission success with no casualties; failure restarts the
// mission. It measures how much the team got done and what HQ learned, and shows the payout and the budget it makes for the next mission.

export type Outcome = 'win' | 'casualties' | 'failed' | 'bankrupt';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export { CASUALTY_PENALTY } from './prices';
import { CASUALTY_PENALTY } from './prices';

export type WrapUp = {
  outcome: Outcome;
  reason: string;
  objectives: { label: string; done: boolean }[];
  teamWork: { label: string; value: string }[];
  newIntel: { label: string; value: string }[];
  payout: { label: string; amount: number }[]; // the mission's P&L, line by line (ILI-1316)
  pnl: number; // what the mission made or lost
  budget: number; // the closing balance, carried to the next mission
  timeUsedMs: number;
  // The grade (ILI-1563): how well the job was done, not just whether. Four things, each shown.
  grade: Grade;
  card: { label: string; value: string }[];
};

// Points off 100 (ILI-1563): each operator down 20, each ambush walked into 10, a point per $100K of
// support (up to 30), and up to 15 for the clock past its halfway mark. A done job grades A to D;
// a failed one is F.
export function gradeOf(s: GameState): { grade: Grade; score: number } {
  const o = outcomeOf(s);
  if (o === 'failed' || o === 'bankrupt') return { grade: 'F', score: 0 };
  const used = s.elapsedMs / Math.max(1, s.timer.totalMs);
  const score = 100 - 20 * casualties(s) - 10 * ambushesOf(s) - Math.min(30, -s.resources.ledger.spent / 100_000) - 15 * Math.max(0, (used - 0.5) / 0.5);
  return { grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', score };
}

// Fights ALPHA walked into blind: its "CONTACT, ambush" calls.
const ambushesOf = (s: GameState) => s.comms.messages.filter((m) => m.text.includes('CONTACT, ambush')).length;

// Casualties: everyone who went down, even if a replacement took their place.
const casualties = (s: GameState) => new Set([...s.stats.lost, ...s.team.operators.filter((o) => o.health <= 0).map((o) => o.id)]).size;

export function outcomeOf(s: GameState): Outcome {
  if (s.bankrupt) return 'bankrupt';
  const down = casualties(s);
  if (s.mission.phase !== 'complete') return 'failed';
  return down ? 'casualties' : 'win';
}

// The square of the ambush that wiped the team, if one did (ILI-1453).
const blindAmbush = (s: GameState) => (s.team.fight?.ambush ? s.team.fight.square : undefined);

export function wrapUp(s: GameState): WrapUp {
  const outcome = outcomeOf(s);
  const down = casualties(s);
  const wiped = s.team.operators.every((o) => o.health <= 0);
  const reason = outcome === 'bankrupt'
    ? 'Castle House has lost its credit and can\u2019t pay its bills. The operation is over; the PMC is shut down.'
    : outcome === 'win'
      ? 'Black box recovered. Everyone came home.'
      : outcome === 'casualties'
        ? `Black box recovered, but ${down} operator${down > 1 ? 's' : ''} down.`
        : wiped
          ? blindAmbush(s)
            ? `${s.team.callsign} walked into ${blindAmbush(s)} without a look. No survivors.`
            : 'The team was lost.'
          : 'Time ran out before exfil.';

  const found = s.contacts.filter((c) => c.status !== 'hidden').length;
  const cleared = s.contacts.filter((c) => c.status === 'cleared').length;
  const avoided = s.contacts.filter((c) => c.status === 'avoided').length;
  const ambushes = ambushesOf(s);

  // The P&L (ILI-1316): up front, out of escrow, the field, support, and the casualties.
  const { ledger } = s.resources;
  const penalty = outcome === 'failed' || outcome === 'bankrupt' ? 0 : down * CASUALTY_PENALTY;
  const payout = [
    { label: 'Deployment', amount: ledger.deploy },
    { label: 'Contract, out of escrow', amount: ledger.escrow },
    { label: 'Earned in the field', amount: ledger.field }, // kill cash, documents, loot
    { label: 'Support', amount: ledger.spent },
    ...(penalty ? [{ label: `Casualties (${down})`, amount: -penalty }] : []),
  ];
  const closing = s.resources.budget - penalty;

  return {
    outcome,
    reason,
    objectives: [
      { label: `Recover the black box at ${s.mission.b}`, done: s.mission.blackBox },
      { label: `Exfil at ${s.mission.c}`, done: s.mission.phase === 'complete' },
      { label: 'No casualties', done: down === 0 && s.mission.phase === 'complete' },
    ],
    teamWork: [
      { label: 'Contacts found before contact', value: `${found - ambushes} of ${s.contacts.length}` },
      { label: 'Contacts destroyed', value: String(cleared) },
      { label: 'Contacts avoided', value: String(avoided) },
      { label: 'Ambushes walked into', value: String(ambushes) },
    ],
    newIntel: [
      { label: 'Squares imaged', value: `${s.map.scanned.length} of 40` },
      { label: 'Kill sites searched', value: String(s.stats.searched) },
      { label: 'Intercepts decoded', value: String(s.stats.decoded) },
      { label: 'Wreck documents', value: s.mission.blackBox ? 'Recovered' : '—' },
    ],
    payout,
    pnl: closing - ledger.opening,
    budget: closing,
    timeUsedMs: s.elapsedMs,
    grade: gradeOf(s).grade,
    card: [
      { label: 'Time used', value: `${Math.floor(s.elapsedMs / 60_000)}:${String(Math.floor((s.elapsedMs % 60_000) / 1000)).padStart(2, '0')}` },
      { label: 'Men lost', value: String(down) },
      { label: 'Spent on support', value: `$${Math.max(0, Math.round(-ledger.spent / 1000)).toLocaleString('en-US')}K` },
      { label: 'Ambushes', value: String(ambushes) },
    ],
  };
}
