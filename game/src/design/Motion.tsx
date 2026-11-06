import { useState, type CSSProperties } from 'react';
import { OrionRack } from '../hud/OrionFeed';
import { Section, Spec } from './DesignSystem';
import { MISSION } from '../sim/state';

// The imaging satellite's name on the current mission (ILI-1401).
const SAT = MISSION.satellite;

// Panels and motion (ILI-1326): the panel, how panels come on and go off, parallax, and the
// ORION-3 rack saved from the title's close-up (ILI-1323), running live. The power-on demos are
// the game's own CSS: a .hud with data-boot, slots and panels.
function Panel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="panel ds-panel">
      <h2>
        <span>{title}</span>
        <span className="where">live</span>
      </h2>
      {rows.map((r) => (
        <p key={r}>{r}</p>
      ))}
    </section>
  );
}

function Boot({ mode }: { mode: 'again' | 'first' }) {
  const [run, setRun] = useState(0);
  return (
    <div className="ds-boot">
      <button className="ds-btn" onClick={() => setRun((n) => n + 1)}>
        Replay
      </button>
      <div key={run} className="hud ds-hud" data-boot={mode}>
        <div className="slot-widget">
          <Panel title="BLACK BOX" rows={['9:42 on the clock', 'Recover the black box at D3']} />
        </div>
        <div className="slot-satcom">
          <section className="panel ds-panel">
            <h2>
              <span>COMMS</span>
            </h2>
            <ul className="ds-list">
              <li>{SAT} Slewing to E3.</li>
              <li>ALPHA Boots on the ground at G5.</li>
              <li>{SAT} On station over E3.</li>
              <li>{SAT} E3 collection complete.</li>
            </ul>
          </section>
        </div>
        <div className="slot-team">
          <Panel title="ALPHA TEAM" rows={['Reyes · Squad lead', 'Okafor · Gunner', 'Lind · Medic']} />
        </div>
      </div>
    </div>
  );
}

function PowerOff() {
  const [run, setRun] = useState(0);
  return (
    <div className="ds-boot">
      <button className="ds-btn" onClick={() => setRun((n) => n + 1)}>
        Replay
      </button>
      <div className="castle ds-castle">
        <div key={run} className="castle-mark" data-leaving={run > 0 || undefined}>
          <h1>CASTLE HOUSE</h1>
          <p>Private military support · secure terminal</p>
        </div>
      </div>
    </div>
  );
}

function Parallax() {
  const [lean, setLean] = useState({ x: 0, y: 0 });
  return (
    <div
      className="ds-parallax"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setLean({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 });
      }}
      onPointerLeave={() => setLean({ x: 0, y: 0 })}
      style={{ '--lx': lean.x, '--ly': lean.y } as CSSProperties}
    >
      <i className="far" />
      <i className="mid" />
      <i className="near" />
      <span>Move the pointer over this</span>
    </div>
  );
}

export function Motion() {
  return (
    <Section id="motion" title="Panels and motion" intro="Every screen is a set of panels. A panel's frame draws first, a line that opens out, then its content comes in, line by line. Nothing slides or bounces: displays power on and off.">
      <div className="ds-grid">
        <Spec name="The panel" rule="A 1px line border on a translucent panel fill over the map. A header: the name, tracked uppercase, on the left; a live reading on the right.">
          <Panel title={`${SAT}`} rows={['Status · Standby', 'Over · G5']} />
        </Spec>
        <Spec wide name="Power-on, quick" rule="Restart, Retry, Play again, menus and the AAR. The frame opens from a point to a line to full (420 ms), content flickers on in rows, panels a beat apart. Reduced motion: none.">
          <Boot mode="again" />
        </Spec>
        <Spec wide name="Power-on, first boot" rule="The first time in only (ILI-1307): panel by panel, each finishing before the next, lists line by line, then a beat on the link before the clock starts.">
          <Boot mode="first" />
        </Spec>
        <Spec name="Power-off" rule={`START on the title: the logo collapses to a line, then a point (360 ms), as the camera flies in on ${SAT}.`}>
          <PowerOff />
        </Spec>
        <Spec name="Parallax" rule={`The title's ${SAT} close-up leans with the mouse: near layers move most. Mouse only; none for touch or reduced motion.`}>
          <Parallax />
        </Spec>
      </div>
      <Spec wide name={`The ${SAT} rack (saved from the title, ILI-1323)`} rule="Film-style ops screens: dials (arc, needle, value), meters as bars, a ground track, a dancing spectrum, a scrolling log fading out at the top, and dead feeds: static, a rolling bar, NO CARRIER. Flavour, never the mission; everything wanders on its own clock.">
        <div className="ds-rack">
          <OrionRack />
        </div>
      </Spec>
    </Section>
  );
}
