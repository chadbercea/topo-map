import { useEffect, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { EventCard } from './EventCard';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { SatelliteInset } from './SatelliteInset';
import { Orion3Panel } from './Orion3Panel';
import { Assets } from './Assets';
import { MissionBar } from './MissionBar';
import { CommsPanel } from './CommsPanel';
import { IntelStream } from './IntelStream';
import { TeamPanel } from './TeamPanel';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';
import { waitingCalls } from '../sim/comms';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'intel' | 'orion' | 'team' | 'satcom';

// The war room (ILI-1186): HQ sits down to a live, multi-panel view of the theater. The
// mission bar runs along the top, the intel side down the left (the stream, and ORION-3 the
// imaging satellite at its foot, ILI-1195), and the map fills the rest. Along the bottom:
// whatever needs an answer on the map (target menu, mini game) and HQ's assets, then the
// team panel and satcom, the comms satellite, in the bottom-right corner. On a phone the
// stream, ORION-3, team and satcom share one docked panel with tabs.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const calls = useGame((s) => waitingCalls(s.comms).length);
  const selected = useGame((s) => s.map.selected);
  const sat = useGame((s) => s.satellite.state);
  const [tab, setTab] = useState<Tab>('satcom');
  // On a phone the dock follows the action: a call brings satcom forward; a square picked on
  // the map, or ORION-3 moving on to its next step (slewing, on station, capturing), brings
  // ORION-3's panel.
  useEffect(() => {
    if (calls) setTab('satcom');
  }, [calls]);
  useEffect(() => {
    if (selected || sat !== 'idle') setTab('orion');
  }, [selected, sat]);

  return (
    <div className="hud" data-playing={playing} data-tab={tab}>
      <div className="slot-bar">
        <MissionBar />
      </div>
      <div className="slot-stream">
        <IntelStream />
      </div>
      <MapArea />
      <SatelliteInset />
      <div className="slot-band">
        <div className="band-cards">
          <EventCard />
          <MiniGamePanel />
        </div>
        <div className="map-controls">
          <Assets />
        </div>
      </div>
      <div className="slot-orion">
        <Orion3Panel />
      </div>
      <div className="slot-team">
        <TeamPanel />
      </div>
      <div className="slot-satcom">
        <CommsPanel />
      </div>
      <nav className="dock-tabs" aria-label="Panels">
        {(['intel', 'orion', 'team', 'satcom'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t === 'orion' ? 'ORION-3' : t.toUpperCase()}
            {t === 'satcom' && calls > 0 && <span className="badge">{calls}</span>}
          </button>
        ))}
      </nav>
      {debug && <DebugPanel />}
      <PauseMenu />
      <WrapUp />
    </div>
  );
}
