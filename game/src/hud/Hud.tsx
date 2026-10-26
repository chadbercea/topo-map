import { DebugPanel } from './DebugPanel';
import { EventAlerts, EventCard } from './EventAlerts';
import { game } from '../sim/store';
import { IntelPanel } from './IntelPanel';
import { MapArea } from './MapArea';
import { MapViews } from './MapViews';
import { MissionTimer } from './MissionTimer';
import { PauseMenu } from './PauseMenu';
import { TeamPanel } from './TeamPanel';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

// War room layout (GDD HUD anatomy): intel on the left, the mission timer on the right,
// the team panel bottom left, and the theater map in the space between. On a phone in
// portrait the panels become a top and a bottom bar and intel collapses.
export function Hud() {
  return (
    <div className="hud">
      <div className="slot-intel">
        <IntelPanel />
      </div>
      <div className="slot-timer">
        <MissionTimer />
      </div>
      <div className="slot-map">
        <MapArea />
        <MapViews />
        <EventAlerts />
        <EventCard />
      </div>
      <div className="slot-team">
        <TeamPanel />
      </div>
      {debug && <DebugPanel />}
      <PauseMenu />
    </div>
  );
}
