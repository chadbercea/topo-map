import { Section } from './DesignSystem';
import { MISSION } from '../sim/state';

// The imaging satellite's name on the current mission (ILI-1401).
const SAT = MISSION.satellite;

// Voice and comms (ILI-1330): who talks, what they say and how, and the rules learned the hard
// way over the game's history.
const WHO: [string, string, string][] = [
  ['ALPHA', 'The team on the ground (Reyes, Okafor, Lind, Tanaka, Brandt)', 'Its decisions, and its one question: resupply.'],
  [`${SAT}`, 'Castle House’s imaging satellite', 'Status only, terse: slewing, ON STATION.'],
  ['Analysts', 'The analyst cell', 'A result that needs attention, by grid and kind. Nothing significant gets no line.'],
  ['HQ', 'Castle House', 'Echoes of what the player did; ALL STATIONS time calls.'],
  ['OVERWATCH', 'The sniper contract', 'Set, NO JOY, down, clear.'],
  ['REAPER-1', 'The drone', 'NO JOY, down, clear; rearmed, ON STATION.'],
  ['HAMMER-2', 'The attack helicopter', 'NO JOY, down, clear; rearmed, ON STATION.'],
  ['SKYHOOK-1', 'The exfil bird', 'Inbound LZ, wheels down.'],
  ['HAULER-2', 'The resupply bird', 'Inbound, wheels down, RTB.'],
];
const WORDS: [string, string][] = [
  ['Reposition', `Task ${SAT} to a square. Only in ${SAT}’s panel.`],
  ['Analyze / Video', 'The ways to look. Analyze images and reports the square; video keeps it live while on station.'],
  ['ON STATION / OFF STATION', `${SAT} is over the square, or not on any.`],
  ['COLLECTING', `${SAT} is capturing. The button can say Analyze; the status says COLLECTING.`],
  ['Nothing significant', 'An empty result: on the flyout, F4 · IMAGERY · NOTHING SIGNIFICANT · 1432Z. Never on the radio.'],
  ['Intel received ✓', 'ALPHA has the package. On the instruments, never the radio.'],
  ['ROGER / WILCO / AFFIRM', 'Received / will comply / yes. Never COPY; ROGER is not yes.'],
  ['Clear', 'A strike or square is finished.'],
  ['Your decision', 'What HQ chooses. Never “call”: a call is the radio.'],
  ['Escrow', 'The contract’s money, released as the job gets done.'],
];
const KINDS: [string, string, string][] = [
  ['Call', 'ALPHA needs HQ: an orange flag at its marker and in its box, until answered.', 'ALPHA · HQ, ALPHA, request resupply at E3. Combat ineffective, 2 down.'],
  ['Alert', 'News that matters now: red, up for a few seconds, then a line in the log.', 'HQ · ALL STATIONS, HQ, enemy net active after the strikes. Enemy alerted to the PMC.'],
  ['Log', 'Everything else: the record, quiet.', 'Analysts · E3 imagery, 5 dismounts, unaware.'],
];
const DOS: [string, string][] = [
  ['ALPHA: “HQ, ALPHA, CONTACT E3, an armed squad. Too strong to take. Moving around via E4.”', 'ALPHA: “Contact in E3. Attack, hold or go around?” (the team decides; HQ changes the odds)'],
  ['The flyout reads F4 · IMAGERY · NOTHING SIGNIFICANT', '“F4 analysis complete: nothing there. Intel posted for ALPHA.” (feedback goes on the instruments)'],
  ['“ALPHA waiting on your decision”', '“ALPHA waiting on your call”'],
  [`${SAT}: “HQ, ${SAT}, ON STATION F4.”`, `${SAT}: “Ready to shoot.” (the satellite looks; it isn’t the sniper)`],
  ['Reposition, with where and how long', '“Task” or “Get eyes on” (jargon, and not where the satellite lives)'],
];

export function Voice() {
  return (
    <Section id="voice" title="Voice and comms" intro="Satcom is remote, expensive and short: it carries what's critical. Feedback shows on the instruments, not over the radio. Everyone speaks in clipped, specific military English, and says what they're doing, not how they feel.">
      <h3>Who speaks</h3>
      <div className="ds-table">
        {WHO.map(([who, is, says]) => (
          <div key={who}>
            <b>{who}</b>
            <span>{is}</span>
            <span>{says}</span>
          </div>
        ))}
      </div>
      <h3>The rules</h3>
      <ol className="ds-rules">
        <li>Feedback shows on the instruments: a stamp, a bar, a flash. Not a radio line.</li>
        <li>Satcom carries only what's critical: a decision, a request, a result.</li>
        <li>ALPHA is autonomous. It tells HQ what it's doing; it asks only for a resupply bird.</li>
        <li>Never &ldquo;call&rdquo; for the player's decision.</li>
        <li>No briefing. Nothing on the way in tells the player what the mission is.</li>
      </ol>
      <h3>Message kinds</h3>
      <div className="ds-kinds">
        {KINDS.map(([kind, what, line]) => (
          <div key={kind} data-kind={kind}>
            <b>{kind}</b>
            <span>{what}</span>
            <code>{line}</code>
          </div>
        ))}
      </div>
      <h3>Vocabulary</h3>
      <div className="ds-table ds-two">
        {WORDS.map(([w, m]) => (
          <div key={w}>
            <b>{w}</b>
            <span>{m}</span>
          </div>
        ))}
      </div>
      <h3>Do / don't</h3>
      <div className="ds-dos">
        {DOS.map(([d, n]) => (
          <div key={d}>
            <span className="do">{d}</span>
            <span className="dont">{n}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
