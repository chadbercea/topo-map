import { useEffect, useRef, useState } from 'react';
import { useGame } from '../sim/store';
import { Heartbeat, OperatorRow, STATUS } from './OperatorRow';
import { condition } from '../sim/team';
import { bus, EV } from '../game/events';
import { pins, usePins } from './pins';
import { downloadProgress, shelf } from '../sim/intel';
import type { GameState } from '../sim/state';

// The team panel (ILI-1472, after ILI-1123, ILI-1248, ILI-1439): one bar on the bottom edge that
// never moves or resizes, the same 48 px as the comms strip beside it, so the bottom edge is one
// line and the map never reflows. It says who ALPHA is, what it's doing, and each operator's name
// over their heartbeat in their condition's colour. The full table is a drawer that slides up out of
// the bar at the same width, with labelled columns. It never opens by itself: an operator hit turns
// their slot red and blinks it, and their prompt docks above the bar.
// onToggle is given where the bar is the panel's handle (wide, fold upright). On a phone, and in the
// rail of a screen on its side, the panel is a tab: the table alone, under a plain header.
export function TeamPanel({ highlight, minimized = false, onToggle }: { highlight?: string | null; minimized?: boolean; onToggle?: () => void }) {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fighting = useGame((s) => !!s.team.fight);
  const alerted = useGame((s) => s.alerted);
  const operators = useGame((s) => s.team.operators);
  const worst = operators.map(condition).sort((a, b) => RANK[b] - RANK[a])[0];
  const open = !minimized || !onToggle;
  const hovered = usePins().hovered;

  const table = (
    <div className="team-drawer" data-testid="team-drawer">
      <div className="team-cols" aria-hidden>
        <span className="c-who">Operator</span>
        <span className="c-vitals">Heartbeat</span>
        <span>Ammo</span>
        <span>Meds</span>
        <span>Noise</span>
      </div>
      <ul className="readout" data-testid="readout">
        {operators.map((o) => (
          <OperatorRow key={o.id} o={o} highlight={o.id === highlight || hovered === `op:${o.id}`} />
        ))}
      </ul>
    </div>
  );
  const title = (
    <h2>
      <span className="callsign" data-testid="team-title">
        {callsign} TEAM
      </span>
      <span className="activity">{activity}</span>
      {alerted && ( // the enemy knows a PMC is here; each operator's noise is on their row
        <b className="alerted" data-testid="alerted">
          ALERTED
        </b>
      )}
    </h2>
  );

  if (!onToggle)
    return (
      <section className="panel team" data-testid="team-panel" data-fight={fighting} data-state="full" data-tab-panel aria-label={`${callsign} team`}>
        {title}
        <Satcom />
        {table}
      </section>
    );

  return (
    <section className="panel team" data-testid="team-panel" data-fight={fighting} data-state={open ? 'full' : 'min'} data-worst={worst} aria-label={`${callsign} team`}>
      {open && table}
      <div className="team-bar">
        {title}
        <Satcom />
        <HeartbeatStrip open={open} onToggle={onToggle} />
        <button className="team-min" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Close the team table' : 'Open the team table'} title={open ? 'Close' : 'Open'} data-testid={open ? 'team-minimize' : 'team-expand'}>
          {open ? '▾' : '▴'}
        </button>
      </div>
    </section>
  );
}

// The heartbeat strip (ILI-1396, ILI-1472): the bar's middle, one slot per operator: name, heartbeat
// and status in their condition's colour. A click on a slot opens the table with them highlighted; a
// hover brackets them on the map, and hovering them on the map lights their slot. A slot whose
// operator just got worse blinks.
export function HeartbeatStrip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const callsign = useGame((s) => s.team.callsign);
  const operators = useGame((s) => s.team.operators);
  const hovered = usePins().hovered;
  const worst = operators.map(condition).sort((a, b) => RANK[b] - RANK[a])[0];
  return (
    <div className="heartbeat-strip" role="group" aria-label={`${callsign} team: ${open ? 'close' : 'open'} the team panel`} data-testid="heartbeat-strip" data-worst={worst} data-overlay="heartbeats" onClick={onToggle}>
      {operators.map((o) => (
        <Slot key={o.id} id={o.id} name={o.name} hovered={hovered === `op:${o.id}`} />
      ))}
    </div>
  );
}

function Slot({ id, name, hovered }: { id: string; name: string; hovered: boolean }) {
  const o = useGame((s) => s.team.operators.find((x) => x.id === id)!);
  const c = condition(o);
  // A blink each time their condition gets worse (twice, then steady).
  const last = useRef(c);
  const [blink, setBlink] = useState(0);
  useEffect(() => {
    if (RANK[c] > RANK[last.current]) setBlink((n) => n + 1);
    last.current = c;
  }, [c]);
  return (
    <span
      key={blink}
      className="hb"
      data-condition={c}
      data-blink={blink > 0 || undefined}
      data-hover={hovered || undefined}
      data-testid={`hb-${id}`}
      onClick={(e) => {
        e.stopPropagation();
        bus.emit(EV.openTeam, id); // open with them highlighted
      }}
      onPointerEnter={() => pins.hover(`op:${id}`, 'map')}
      onPointerLeave={() => pins.get().hovered === `op:${id}` && pins.hover(null, 'map')}
    >
      <span className="hb-name">{name}</span>
      <Heartbeat o={o} />
      <span className="hb-status">{STATUS[c]}</span>
    </span>
  );
}
const RANK = { fine: 0, caution: 1, danger: 2, down: 3 } as const;

// ALPHA's SATCOM (ILI-1499): HQ posts intel on the shelf; the team pulls it down. One instrument on
// the team bar says where that stands: packages waiting on the shelf (a count), a download under
// way (a short bar), or what just came down (received, for a few seconds). No radio, no pop-up.
const RECEIVED_MS = 5_000;
export function satcomView(s: GameState): { state: 'idle' | 'posted' | 'pulling' | 'received'; text: string; progress: number } {
  const d = s.intel.download;
  const sq = (ids: string[]) => [...new Set(s.intel.pushes.filter((p) => ids.includes(p.id)).map((p) => p.square ?? '·'))].join(' ');
  if (d) return { state: 'pulling', text: `⇣ ${sq(d.ids)}`, progress: downloadProgress(s) };
  const last = Math.max(-Infinity, ...s.intel.pushes.map((p) => p.pulledMs ?? -Infinity));
  const n = shelf(s).length;
  if (n) return { state: 'posted', text: `${n} posted`, progress: 0 };
  if (s.elapsedMs - last < RECEIVED_MS) return { state: 'received', text: `✓ ${sq(s.intel.pushes.filter((p) => p.pulledMs === last).map((p) => p.id))} received`, progress: 1 };
  return { state: 'idle', text: 'shelf clear', progress: 0 };
}

function Satcom() {
  const state = useGame((s) => satcomView(s).state);
  const text = useGame((s) => satcomView(s).text);
  const progress = useGame((s) => Math.round(satcomView(s).progress * 20) / 20);
  return (
    <span className="tsat" data-state={state} data-testid="team-satcom" title="Intel posted for the team, and what it has pulled down to its SATCOM devices">
      <span className="tsat-k">SATCOM</span>
      <span className="tsat-row">
        <span className="tsat-v" data-testid="satcom-text">
          {text}
        </span>
        {state === 'pulling' && (
          <span className="tsat-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} data-testid="satcom-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </span>
    </span>
  );
}
