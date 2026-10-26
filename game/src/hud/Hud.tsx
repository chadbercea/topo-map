import { DebugPanel } from './DebugPanel';
import { IntelPanel } from './IntelPanel';
import { MapArea } from './MapArea';
import { MissionTimer } from './MissionTimer';
import { PauseMenu } from './PauseMenu';
import { TeamPanel } from './TeamPanel';

const debug = new URLSearchParams(location.search).has('debug');

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
      <MapArea />
      <div className="slot-team">
        <TeamPanel />
      </div>
      {debug && <DebugPanel />}
      <PauseMenu />
    </div>
  );
}
