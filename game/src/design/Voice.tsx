import { Section } from './DesignSystem';

// Voice and comms (ILI-1330): who talks, what they say and how, and the rules learned the hard
// way over the game's history.
const WHO: [string, string, string][] = [
  ['ALPHA', 'The team on the ground (Reyes, Okafor, Lind, Tanaka, Brandt)', 'Its decisions, and its one question: resupply.'],
  ['ORION-3', 'Castle House’s imaging satellite', 'Slewing, on station, collection complete, and what the analysts pushed.'],
  ['HQ', 'Castle House', 'News the map can’t show, the contract and its escrow.'],
  ['SIGINT', 'The intercept desk', 'What a decoded signal said.'],
  ['OVERWATCH', 'The sniper contract', 'On target, Tango down, racking; all down.'],
  ['REAPER-1', 'The drone', 'Inbound, over target, Tango down, the result.'],
  ['HAMMER-2', 'The attack helicopter', 'The gun run, rearmed and back on station.'],
  ['RAVEN-6', 'The exfil bird', 'Inbound, on the ground, lifting.'],
  ['DUSTOFF-2', 'The resupply bird', 'Up, inbound, delivered.'],
];
const WORDS: [string, string][] = [
  ['Reposition', 'Task ORION-3 to a square. Only in ORION-3’s panel.'],
  ['Photo / Video', 'The ways to look. Photo is instant and fades; video is live, once.'],
  ['On station', 'ORION-3 is over the square, ready for collection.'],
  ['Collection complete', 'A look is done; IMINT goes to the analysts, then ALPHA.'],
  ['Soften them up', 'ALPHA wants HQ to thin a contact out before it goes in.'],
  ['All clear / CLEAR', 'Nothing there: the smallest unit of intel.'],
  ['Your decision', 'What HQ chooses. Never “call”: a call is the radio.'],
  ['Escrow', 'The contract’s money, released as the job gets done.'],
];
const KINDS: [string, string, string][] = [
  ['Call', 'ALPHA needs HQ: an orange flag at its marker and in its box, until answered.', 'ALPHA · Two down, the rest hurt. We need a resupply bird.'],
  ['Alert', 'News that matters now: red, up for a few seconds, then a line in the log.', 'HQ · Enemy radio net just lit up: they know a PMC is in the area.'],
  ['Log', 'Everything else: the record, quiet.', 'ORION-3 · E3 collection complete (photo): 5 fighters, unaware.'],
];
const DOS: [string, string][] = [
  ['ALPHA: “Contact in E3, a fortified checkpoint. Not taking that. Going around via E4.”', 'ALPHA: “Contact in E3. Attack, hold or go around?” (the team decides; HQ changes the odds)'],
  ['The square flashes F4 · CLEAR', 'ALPHA radios “F4 is clear” (feedback goes on the instruments)'],
  ['“ALPHA waiting on your decision”', '“ALPHA waiting on your call”'],
  ['ORION-3: “On station over F4. Ready for collection.”', 'ORION-3: “Ready to shoot.” (the satellite looks; it isn’t the sniper)'],
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
