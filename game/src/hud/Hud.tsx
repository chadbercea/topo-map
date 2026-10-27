import { DebugPanel } from './DebugPanel';
import { EventAlerts, EventCard } from './EventAlerts';
import { game, useGame } from '../sim/store';
import { IntelPanel } from './IntelPanel';
import { MapArea } from './MapArea';
import { MapViews } from './MapViews';
import { MiniGamePanel } from './MiniGamePanel';
import { SatellitePanel } from './SatellitePanel';
import { SquareActions } from './SquareActions';
import { MissionBar } from './MissionBar';
import { CallCard } from './CallCard';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';
import { TeamPanel } from './TeamPanel';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

// War room layout (ILI-1170). Two panels stay on screen: the mission bar along the top and
// the team column on the right. Intel is a tab on the left edge that opens a drawer. The
// map's grid fits the space between them, over the full-screen terrain. The band under the
// grid holds whatever needs an answer (target menu, call card, mini game) and the map
// controls. On a phone in portrait it all stacks: bar, grid, tools, heartbeats, the band.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  return (
    <div className="hud" data-playing={playing}>
      <div className="slot-bar">
        <MissionBar />
      </div>
      <div className="slot-intel">
        <IntelPanel />
      </div>
      <EventAlerts />
      <MapArea />
      <div className="slot-team">
        <TeamPanel />
      </div>
      <div className="slot-band">
        <div className="band-cards">
          <EventCard />
          <CallCard />
          <MiniGamePanel />
          <SatellitePanel />
        </div>
        <div className="map-controls">
          <SquareActions />
          <MapViews />
        </div>
      </div>
      {debug && <DebugPanel />}
      <PauseMenu />
      <WrapUp />
    </div>
  );
}
