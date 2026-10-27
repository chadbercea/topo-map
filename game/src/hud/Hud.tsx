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
import { AskWindow } from './AskWindow';
import { IntelStream } from './IntelStream';
import { TeamPanel } from './TeamPanel';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'intel' | 'satcom' | 'team' | 'orion';

// The war room (ILI-1186): HQ sits down to a live, multi-panel view of the theater. The
// mission bar runs along the top; down the left the intel stream, with the comms log under it
// (ILI-1199); the map fills the rest. Along the bottom: the mini game and HQ's assets, then
// the team panel and ORION-3, the imaging satellite (ILI-1195), in the bottom-right corner.
// When ALPHA needs something its ask pops up beside its marker (AskWindow). On a phone the
// stream, comms, team and ORION-3 share one docked panel with tabs.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [tab, setTab] = useState<Tab>('team');
  // On a phone the dock follows the action. A square picked on the map opens its zoomed view
  // on the map itself (ILI-1201), so the dock stays where it is.
  // New events run inline in the intel stream (ILI-1197): a new one brings it forward.
  const fresh = useGame((s) => s.events.filter((e) => e.status === 'new').length);
  useEffect(() => {
    if (fresh) setTab('intel');
  }, [fresh]);

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
        {(['intel', 'satcom', 'team', 'orion'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t === 'orion' ? 'ORION-3' : t === 'satcom' ? 'COMMS' : t.toUpperCase()}
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
