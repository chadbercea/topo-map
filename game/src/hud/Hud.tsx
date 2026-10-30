import { useEffect, useRef, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { AirPanel } from './AirPanel';
import { SquareCard } from './SquareCard';
import { lookSquare } from '../sim/satellite';
import { useTier } from './tier';
import { MissionPanel } from './MissionBar';
import { EnvWidget } from './EnvWidget';
import { OrionPanel } from './OrionPanel';
import { CommsPanel } from './CommsPanel';
import { AskWindow } from './AskWindow';
import { useAskHidden } from './CommsPanel';
import { TeamPanel } from './TeamPanel';
import { CallBox } from './CallBox';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'satcom' | 'orion' | 'team';
type Sheet = 'peek' | 'half' | 'full';
const SHEETS: Sheet[] = ['peek', 'half', 'full'];

// The war room, layout A (ILI-1186, ILI-1226): HQ sits down to a live, multi-panel view of the
// theater. Top left MISSION · BLACK BOX, the clock and the mission in one panel; under it COMMS,
// HQ's one feed (ILI-1225). The map fills the middle, the mini game floating at its foot. Down
// the whole right side ENVIRONMENT, a HUD readout (ILI-1218), over ORION-3 (ILI-1219). Along
// the bottom TEAM, and when ALPHA calls, its call box slides out of TEAM's right end (ILI-1255). A square HQ picks, on the map or named in COMMS, shows in ORION-3's
// panel, its details and Reposition (ILI-1228, ILI-1250), and what HQ can call in on it floats beside it (the
// action panel). When ALPHA needs something its ask pops up beside its marker (AskWindow). On
// a fold or tablet the mission floats over the map's corner and COMMS, ORION-3 and TEAM share a
// rail down the right behind tabs (ILI-1213); on a phone the mission is the line on top and the
// three share a bottom sheet. Picking a square or tasking ORION-3 brings its tab forward.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [tab, setTab] = useState<Tab>('team');
  const askHidden = useAskHidden(); // ALPHA's flag is out of sight: light TEAM's tab, where its call box is (ILI-1255)
  const tier = useTier();
  // On a phone the dock follows the action. A square picked on the map opens its zoomed view
  // on the map itself (ILI-1201), so the dock stays where it is.
  // A new event marks its square on the map, and its report lands in COMMS (ILI-1225): that
  // brings COMMS forward.
  const fresh = useGame((s) => s.events.filter((e) => e.status === 'new').length);
  // On a phone the dock is a bottom sheet (ILI-1214): peek (just the tabs), half or full.
  const [sheet, setSheet] = useState<Sheet>('half');
  useEffect(() => {
    // Not while HQ works a square: ORION-3's panel holds it, and the news can wait (ILI-1228).
    if (fresh && !lookSquare(game.get())) {
      setTab('satcom');
      setSheet((h) => (h === 'peek' ? 'half' : h)); // news opens a peeking sheet
    }
  }, [fresh]);
  // Tasking ORION-3 brings its panel forward on a fold or phone (ILI-1219).
  // So does picking a square: its details and Reposition are there (ILI-1228).
  // Keyed on what changed, so a strike ending with a square still picked brings it back too.
  const tasked = useGame((s) => (lookSquare(s) ? `${lookSquare(s)}|${s.satellite.state}|${!!s.minigame}` : ''));
  useEffect(() => {
    if (tasked) {
      setTab('orion');
      setSheet((h) => (h === 'peek' ? 'half' : h));
    }
  }, [tasked]);
  const pick = (t: Tab) => {
    // A tab always shows its panel: a folded sheet opens. Folding is the handle's job.
    setSheet((h) => (h === 'peek' ? 'half' : h));
    setTab(t);
  };

  return (
    <div className="hud" data-playing={playing} data-tab={tab} data-tier={tier} data-sheet={sheet}>
      <div className="slot-widget">
        <MissionPanel />
      </div>
      <MapArea />
      <SquareCard />
      <div className="slot-band">
        <div className="band-cards" data-overlay="band">
          <MiniGamePanel />
          <AirPanel weapon="drone" />
          <AirPanel weapon="heli" />
        </div>
      </div>
      <div className="slot-orion" data-overlay="orion">
        <OrionPanel />
      </div>
      <div className="slot-bottom">
        {tier !== 'wide' && (
          <div className="slot-small" data-testid="small-widgets">
            <EnvWidget slim />
          </div>
        )}
        <div className="slot-team">
          <TeamPanel />
          <CallBox />
        </div>
      </div>
      <div className="slot-satcom">
        <CommsPanel />
      </div>
      {tier === 'compact' && <SheetHandle sheet={sheet} setSheet={setSheet} />}
      <nav className="dock-tabs" aria-label="Panels">
        {(['satcom', 'orion', 'team'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => (tier === 'compact' ? pick(t) : setTab(t))} data-testid={`tab-${t}`} data-alert={t === 'team' && askHidden && tab !== 'team'}>
            {t === 'satcom' ? 'COMMS' : t === 'orion' ? 'ORION-3' : t.toUpperCase()}
          </button>
        ))}
      </nav>
      <AskWindow />
      {debug && <DebugPanel />}
      <PauseMenu />
      <WrapUp />
    </div>
  );
}

// The bottom sheet's grip (ILI-1214): drag it up or down to snap to the next size, or tap it
// to fold the sheet down to its tabs and back.
function SheetHandle({ sheet, setSheet }: { sheet: Sheet; setSheet: (s: Sheet) => void }) {
  const start = useRef<number | null>(null);
  const step = (d: number) => setSheet(SHEETS[Math.max(0, Math.min(SHEETS.length - 1, SHEETS.indexOf(sheet) + d))]);
  return (
    <button
      className="sheet-handle"
      data-testid="sheet-handle"
      aria-label={sheet === 'peek' ? 'Show panels' : 'Fold panels down'}
      onPointerDown={(e) => {
        start.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        const from = start.current;
        start.current = null;
        if (from === null) return;
        const dy = e.clientY - from;
        if (Math.abs(dy) < 24) setSheet(sheet === 'peek' ? 'half' : 'peek');
        else step(dy < 0 ? 1 : -1);
      }}
      onPointerCancel={() => (start.current = null)}
    >
      <span aria-hidden />
    </button>
  );
}
