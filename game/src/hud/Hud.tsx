import { useEffect, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { EventCard } from './EventCard';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { SatelliteInset } from './SatelliteInset';
import { SatellitePanel } from './SatellitePanel';
import { SquareActions } from './SquareActions';
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

type Tab = 'intel' | 'team' | 'satcom';

// The war room (ILI-1186): HQ sits down to a live, multi-panel view of the theater. The
// mission bar runs along the top, the intel stream down the left, and the map fills the
// rest. Along the bottom: whatever needs an answer on the map (target menu, mini game,
// ORION-3) and the square actions, then the team panel and satcom in the bottom-right
// corner. On a phone the stream, team and satcom share one docked panel with tabs; satcom
// comes forward when the team texts.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const calls = useGame((s) => waitingCalls(s.comms).length);
  const [tab, setTab] = useState<Tab>('satcom');
  useEffect(() => {
    if (calls) setTab('satcom');
  }, [calls]);

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
          <SatellitePanel />
        </div>
        <div className="map-controls">
          <Assets />
          <SquareActions />
        </div>
      </div>
      <div className="slot-team">
        <TeamPanel />
      </div>
      <div className="slot-satcom">
        <CommsPanel />
      </div>
      <nav className="dock-tabs" aria-label="Panels">
        {(['intel', 'team', 'satcom'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t.toUpperCase()}
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
