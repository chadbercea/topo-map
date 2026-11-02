import { Section, Spec } from './DesignSystem';

// Patterns (ILI-1331): how the parts work together. Each with the rule, a small example in the
// game's own markup where there is one, and the tickets that set it.
export function Patterns() {
  return (
    <Section id="patterns" title="Patterns" intro="The player is the war room: god mode over the map, every tool, but the theater only changes through the team on the ground. These patterns keep that true and readable when several things happen at once.">
      <div className="ds-grid">
        <Spec name="The square anchor" rule="A square's contextual action menu, pinned beside it on the map with a leader line: its fighters, its strikes, what's hitting it. It opens only when there's something to act on. Knowing and looking at a square (its details, Reposition) is ORION-3's (ILI-1302, ILI-1308).">
          <div className="square-card ds-static ds-anchor">
            <header className="sc-head">
              <b>E3</b>
              <span className="sc-status">act on</span>
            </header>
            <p className="sc-marked">5 fighters marked</p>
            <div className="sc-event event-card" data-kind="contact">
              <h3>CONTACT · E3</h3>
              <p className="title">A fortified checkpoint</p>
            </div>
          </div>
        </Spec>
        <Spec name="Attention" rule="Orange: someone is waiting on you. Red: a find, a threat. Grey: work in progress elsewhere. Gold: money, or something you can now buy. A tab dot for unseen news; a panel's frame flashes once when it changes in view (ILI-1287, ILI-1306).">
          <div className="ds-row">
            <span className="ds-chip" style={{ background: '#ff8a2a', color: '#0b0f0d' }}>
              waiting on you
            </span>
            <span className="ds-chip" style={{ borderColor: '#e5484d', color: '#e5484d' }}>
              a find
            </span>
            <span className="ds-chip" style={{ borderColor: '#6f8a7d', color: '#cfe8dc' }}>
              in progress
            </span>
            <span className="ds-chip" style={{ borderColor: '#f2c14e', color: '#f2c14e' }}>
              buyable
            </span>
          </div>
        </Spec>
        <Spec name="Teaching through play" rule="No tutorial text. Someone in the fiction says what they need; the need line points at where; the one control that answers it pulses (ILI-1257, ILI-1318).">
          <div className="ds-stack">
            <code className="ds-line">ALPHA · Holding. No intel on what's ahead. Get us eyes on F4.</code>
            <div className="mission ds-mission">
              <button className="need" data-tone="decision">
                ALPHA needs intel: scan ahead at F4
              </button>
            </div>
          </div>
        </Spec>
        <Spec name="The intel gauge" rule="An orange bar by the team's name, a tick a square from empty. Intel is fuel: photos fill it, ALPHA burns it walking, a square per tick's worth; empty, it holds. Scanning further along the route banks intel for when ALPHA heads into that square; video is one big fill, once (ILI-1314, ILI-1319, ILI-1341).">
          <section className="panel team ds-static">
            <h2>
              <span className="callsign">ALPHA TEAM</span>
              <span className="intel-gauge" role="meter" aria-label="Intel">
                <i style={{ width: '46%' }} />
                <b style={{ left: '20%' }} />
              </span>
              <span className="activity">Moving to F4</span>
            </h2>
          </section>
        </Spec>
        <Spec name="ALPHA decides" rule="Heading into a square with a found contact, ALPHA weighs it and says: we'll take them; soften them up and we'll go (20 s); or going around. HQ changes the odds with strikes; it never orders (ILI-1312, ILI-1315).">
          <div className="ds-stack">
            <code className="ds-line">ALPHA · Contact in C2, a foot patrol. We'll take them.</code>
            <code className="ds-line">ALPHA · Contact in E3, a fortified checkpoint. Too many to walk into. Soften them up and we'll go.</code>
            <code className="ds-line">ALPHA · No change in E3. Going around via E4.</code>
          </div>
        </Spec>
        <Spec name="The money" rule="A mission opens in the red (deployment), the contract comes out of escrow as the job gets done, strikes cost per call, the AAR is a P&L, the balance carries, −$4M is bankruptcy. The store sells what makes the next mission better (ILI-1316, ILI-1317).">
          <dl className="ds-pnl">
            <div>
              <dt>Deployment</dt>
              <dd>−$400,000</dd>
            </div>
            <div>
              <dt>Contract, out of escrow</dt>
              <dd>$1,500,000</dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd>−$160,000</dd>
            </div>
            <div className="total">
              <dt>This mission</dt>
              <dd>$940,000</dd>
            </div>
          </dl>
        </Spec>
        <Spec name="The way in" rule="Title (the rook, the menu, the globe blurred) → START: the logo powers off, the camera flies in on ORION-3 → click it: the wipe, the login typing on, the war room powering on panel by panel, the link with ALPHA → the clock starts. No briefing (ILI-1280, ILI-1290, ILI-1307).">
          <ol className="ds-flow">
            <li>Title</li>
            <li>ORION-3</li>
            <li>Wipe</li>
            <li>Login</li>
            <li>Power-on</li>
            <li>Link</li>
            <li>Live</li>
          </ol>
        </Spec>
      </div>
    </Section>
  );
}
