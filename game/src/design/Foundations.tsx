import { Section } from './DesignSystem';
import { MISSION } from '../sim/state';

// The imaging satellite's name on the current mission (ILI-1401).
const SAT = MISSION.satellite;

// Foundations (ILI-1325): the colours and what each means in play, the type, the spacing and the
// layout tiers. The swatches read the game's own CSS variables where it has them.
const COLOURS: [string, string, string][] = [
  ['--bg', '#0b0f0d', 'The war room at night. Every surface starts here.'],
  ['--ink', '#cfe8dc', 'Text and readings: what HQ reads.'],
  ['--dim', '#6f8a7d', 'Labels, secondary text, things at rest.'],
  ['--accent', '#35d0a5', `Ours, and live: the HUD, ${SAT}’s lines, a control that works.`],
  ['--line', 'rgba(53, 208, 165, 0.35)', 'Panel edges and rules.'],
  ['--panel', 'rgba(11, 15, 13, 0.66)', 'A panel’s fill, over the map.'],
];
const GAME: [string, string, string][] = [
  ['Orange', '#ff8a2a', `ALPHA waiting on you; ${SAT} on the title; the exfil bird. Look here now.`],
  ['Red', '#e5484d', 'The enemy, loss and strikes: contacts, kills, the red balance, a bankrupt PMC.'],
  ['Gold', '#f2c14e', 'ALPHA on the map, money and what it buys, a request, a decision in the need line.'],
  ['Blue', '#8fb8ff', 'Signals: enemy radio to listen to or jam.'],
  ['Water', '#5fa8d3', 'Rivers and streams on the map.'],
];
const TYPE: [number, string, string][] = [
  [28, 'The clock, countdowns', '9:42'],
  [14, 'The balance, a lead line', '$1,100,000'],
  [13, 'Menu buttons, panel titles', 'AFTER ACTION REPORT'],
  [12, 'Body, COMMS lines', 'Contact in E3, a fortified checkpoint. Not taking that.'],
  [11, 'Panel text, facts', 'Elevation 674–830 m · steep'],
  [10, 'Labels (uppercase, tracked)', 'TIME TO TARGET'],
  [9, 'Small labels', 'GIMBAL AZ'],
];
const TIERS: [string, string, string][] = [
  ['Compact', 'under 700 px', 'A phone: the mission on top, the map, the panels in a bottom sheet behind tabs.'],
  ['Medium', '700 to 1199 px', 'A fold or tablet, either way up: the map, and a side rail with tabs.'],
  ['Wide', '1200 px and up', `Desktop, layout A: mission and COMMS left, the map, ${SAT} right, TEAM along the bottom.`],
];

export function Foundations() {
  return (
    <Section id="foundations" title="Foundations" intro="One dark field, one accent, and a handful of colours that each mean one thing. One monospace face. Bars, not numbers, for anything that is a level.">
      <h3>Colour: the tokens</h3>
      <div className="ds-swatches">
        {COLOURS.map(([v, hex, what]) => (
          <div className="ds-swatch" key={v}>
            <i style={{ background: `var(${v})` }} />
            <b>{v}</b>
            <code>{hex}</code>
            <span>{what}</span>
          </div>
        ))}
      </div>
      <h3>Colour: what the game paints with</h3>
      <div className="ds-swatches">
        {GAME.map(([name, hex, what]) => (
          <div className="ds-swatch" key={name}>
            <i style={{ background: hex }} />
            <b>{name}</b>
            <code>{hex}</code>
            <span>{what}</span>
          </div>
        ))}
      </div>
      <p className="ds-rule">A colour is a meaning, not a decoration: never use orange for anything but &ldquo;look here now&rdquo;, never red for anything the player owns.</p>

      <h3>Type</h3>
      <p className="ds-rule">JetBrains Mono, 400 and 600, everywhere. Labels are uppercase with wide tracking (0.08–0.24em); readings are mixed case with tabular figures.</p>
      <div className="ds-type">
        {TYPE.map(([px, use, sample]) => (
          <div key={px}>
            <span className="ds-type-meta">
              {px}px · {use}
            </span>
            <span style={{ fontSize: px, letterSpacing: px <= 10 ? '0.12em' : px >= 13 && sample === sample.toUpperCase() ? '0.2em' : undefined }}>{sample}</span>
          </div>
        ))}
      </div>

      <h3>Spacing and layout</h3>
      <div className="ds-spacing">
        {[4, 8, 16, 22].map((n) => (
          <div key={n}>
            <i style={{ width: n * 4, height: 10 }} />
            <span>{n}px</span>
            <small>{n === 4 ? 'inside controls' : n === 8 ? 'between rows and panels' : n === 16 ? 'the gutter (--gutter), panel padding' : 'between stacked screens'}</small>
          </div>
        ))}
      </div>
      <div className="ds-tiers">
        {TIERS.map(([name, size, what]) => (
          <div key={name}>
            <b>{name}</b>
            <code>{size}</code>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
