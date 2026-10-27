import { Briefing } from './Briefing';
import { DebugPanel } from './DebugPanel';
import { EventAlerts, EventCard } from './EventAlerts';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { SatelliteInset } from './SatelliteInset';
import { SatellitePanel } from './SatellitePanel';
import { SquareActions } from './SquareActions';
import { MissionBar } from './MissionBar';
import { CallCard } from './CallCard';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

// War room layout (ILI-1170, edges since ILI-1183). The grid fills the screen; the panels
// hug its top and bottom edges, each within half a grid square, so every square's centre
// stays in view. The mission bar (with ALPHA's status) runs along the top; the band along
// the bottom holds whatever needs an answer (call card, target menu, mini game) and the
// square actions. Map views live in the pause menu.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  return (
    <div className="hud" data-playing={playing}>
      <div className="slot-bar">
        <MissionBar />
      </div>
      <EventAlerts />
      <MapArea />
      <SatelliteInset />
      <div className="slot-band">
        <div className="band-cards">
          <EventCard />
          <CallCard />
          <MiniGamePanel />
          <SatellitePanel />
        </div>
        <div className="map-controls">
          <SquareActions />
        </div>
      </div>
      {debug && <DebugPanel />}
      <Briefing />
      <PauseMenu />
      <WrapUp />
    </div>
  );
}
