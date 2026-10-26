import type { GameState } from './state';

// The wrap-up (GDD): win needs mission success with no casualties; failure restarts the
// mission. It measures how much the team got done with HQ's intel and how much new intel
// was found, and shows the payout and the budget it makes for the next mission.

export type Outcome = 'win' | 'casualties' | 'failed';

export const CONTRACT = 20_000; // the client pays this for the black box at exfil
export const CASUALTY_PENALTY = 5_000; // per operator down

export type WrapUp = {
  outcome: Outcome;
  reason: string;
  objectives: { label: string; done: boolean }[];
  teamWork: { label: string; value: string }[];
  newIntel: { label: string; value: string }[];
  payout: { label: string; amount: number }[];
  budget: number;
  timeUsedMs: number;
};

export function outcomeOf(s: GameState): Outcome {
  const down = s.team.operators.filter((o) => o.health <= 0).length;
  if (s.mission.phase !== 'complete') return 'failed';
  return down ? 'casualties' : 'win';
}

export function wrapUp(s: GameState): WrapUp {
  const outcome = outcomeOf(s);
  const down = s.team.operators.filter((o) => o.health <= 0).length;
  const wiped = down === s.team.operators.length;
  const reason =
    outcome === 'win'
      ? 'Black box recovered. Everyone came home.'
      : outcome === 'casualties'
        ? `Black box recovered, but ${down} operator${down > 1 ? 's' : ''} down.`
        : wiped
          ? 'The team was lost.'
          : 'Time ran out before exfil.';

  const found = s.contacts.filter((c) => c.status !== 'hidden').length;
  const cleared = s.contacts.filter((c) => c.status === 'cleared').length;
  const avoided = s.contacts.filter((c) => c.status === 'avoided').length;
  const ambushes = s.comms.messages.filter((m) => m.text.startsWith('Ambush')).length;

  const contract = outcome === 'failed' ? 0 : CONTRACT;
  const penalty = outcome === 'failed' ? 0 : down * CASUALTY_PENALTY;
  const earned = s.resources.budget; // kill cash, documents, bonuses during the mission
  const payout = [
    { label: 'Contract', amount: contract },
    { label: 'Earned in the field', amount: earned },
    ...(penalty ? [{ label: `Casualties (${down})`, amount: -penalty }] : []),
  ];

  return {
    outcome,
    reason,
    objectives: [
      { label: `Recover the black box at ${s.mission.b}`, done: s.mission.blackBox },
      { label: `Exfil at ${s.mission.c}`, done: s.mission.phase === 'complete' },
      { label: 'No casualties', done: down === 0 && s.mission.phase === 'complete' },
    ],
    teamWork: [
      { label: 'Intel sent to the team', value: String(s.intel.sent.length) },
      { label: 'Contacts found before contact', value: `${found - ambushes} of ${s.contacts.length}` },
      { label: 'Contacts cleared', value: String(cleared) },
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
    budget: Math.max(0, payout.reduce((n, p) => n + p.amount, 0)),
    timeUsedMs: s.elapsedMs,
  };
}
