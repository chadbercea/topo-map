import { Section, Spec } from './DesignSystem';
import { MISSION } from '../sim/state';

// The imaging satellite's name on the current mission (ILI-1401).
const SAT = MISSION.satellite;

// Controls (ILI-1327): the game's controls in each state, in the game's own markup and classes,
// so they look exactly as they do in play.
export function Controls() {
  return (
    <Section id="controls" title="Controls" intro="Few controls, each in one place, each saying what it does. A control that can't act says why. The one control that answers what someone in the fiction asked for pulses (ILI-1318); nothing else does.">
      <div className="ds-grid">
        <Spec name="Menu buttons" rule="Pause, the title, the AAR. Uppercase, a line border; the accent on hover and focus.">
          <div className="panel menu ds-inline-menu">
            <button>Resume</button>
            <button className="go">Start mission</button>
          </div>
        </Spec>
        <Spec name="Title menu" rule="START leads in the accent; arrow keys step along it.">
          <nav className="title-menu">
            <button>Start</button>
            <button>About</button>
            <button>Settings</button>
          </nav>
        </Spec>
        <Spec name={`${SAT}: Reposition`} rule={`${SAT}'s one button until it's over the square HQ picked: where, and how long. Only ever in ${SAT}'s panel (ILI-1308).`}>
          <div className="orion ds-orion">
            <div className="o-buttons">
              <button className="o-reposition">
                Reposition
                <small>to E3 · 0:08</small>
              </button>
            </div>
          </div>
        </Spec>
        <Spec name={`${SAT}: Photo / Video`} rule="On station, the ways to look take Reposition's place. Photo pulses when it's the next thing to do. Video is once a mission: then it reads used.">
          <div className="orion ds-orion">
            <div className="o-buttons">
              <div className="modes">
                <button data-cue>
                  Photo
                  <small>instant</small>
                </button>
                <button disabled>
                  Video
                  <small>used</small>
                </button>
              </div>
            </div>
          </div>
        </Spec>
        <Spec name="Strikes" rule="In the target's square anchor, every weapon with its state; locked, busy or blind ones say why. Red cue while ALPHA holds short asking for them softened.">
          <div className="square-card ds-static">
            <div className="target-menu">
              <div className="options">
                <button data-cue>
                  <span>Sniper</span>
                  <small>Ready</small>
                </button>
                <button>
                  <span>Drone strike</span>
                  <small>Ready</small>
                </button>
                <button disabled>
                  <span>Helicopter gun run</span>
                  <small>Ready in 0:42</small>
                </button>
              </div>
            </div>
          </div>
        </Spec>
        <Spec name="The ability bar" rule="The balance (red below zero) and the capabilities in the order they're bought: locked (dashed, the price), buyable (gold, pulsing), ready (the price per call), busy (the cooldown).">
          <section className="ability-bar ds-static">
            <div className="ab-balance" data-red>
              <small>Balance</small>
              <b>−$400k</b>
            </div>
            <button className="ab-slot" data-state="ready">
              <i>1</i>
              <span>Sniper</span>
              <small>$10k / call</small>
            </button>
            <button className="ab-slot" data-state="buyable">
              <i>2</i>
              <span>Drone</span>
              <small>Unlock $750k</small>
            </button>
            <button className="ab-slot" data-state="locked" disabled>
              <i>3</i>
              <span>Heli</span>
              <small>Unlock $1.5M</small>
            </button>
          </section>
        </Spec>
        <Spec name="The need line" rule="Under the mission: the one most pressing thing. Gold for a decision, red for a threat. A tap goes to what it's about.">
          <div className="mission ds-mission">
            <button className="need" data-tone="decision">
              ALPHA requests imagery of F4
            </button>
            <button className="need" data-tone="threat">
              Contact on the route at E3
            </button>
          </div>
        </Spec>
        <Spec name="Tabs and their badges" rule="A fold or phone. An orange dot: news you haven't seen. The whole tab orange: ALPHA waiting on you.">
          <nav className="dock-tabs ds-tabs">
            <button data-update>
              COMMS
              <span className="tab-dot" />
            </button>
            <button aria-pressed>{SAT}</button>
            <button data-alert="true">TEAM</button>
          </nav>
        </Spec>
        <Spec name="Store items" rule="After the mission: what it does, its price; dimmed when the bank can't cover it; Owned once bought.">
          <div className="menu store ds-store">
            <div className="store-item">
              <div>
                <b>Lean deployment</b>
                <small>Putting the team in the field costs 25% less.</small>
              </div>
              <button>$400K</button>
            </div>
            <div className="store-item">
              <div>
                <b>Better clients</b>
                <small>Contracts pay 20% more.</small>
              </div>
              <button disabled>$750K</button>
            </div>
            <div className="store-item" data-owned>
              <div>
                <b>Field hospital</b>
                <small>The team carries 50% more meds.</small>
              </div>
              <button disabled>Owned</button>
            </div>
          </div>
        </Spec>
        <Spec name="Busy chip and hover tag" rule="Grey: work in progress at a square that isn't picked; a tap opens its anchor. A hover tag names a ping or a satellite.">
          <div className="ds-row">
            <button className="busy-chip ds-static">
              <b>E3</b>
              <span>REAPER-1 · 0:05</span>
            </button>
            <span className="ds-tag" style={{ color: '#e5484d', borderColor: '#e5484d' }}>
              E3 · A fortified checkpoint
            </span>
            <span className="ds-tag">Coming Soon</span>
          </div>
        </Spec>
      </div>
    </Section>
  );
}
