import { useEffect, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { hasActions, SquareCard } from './SquareCard';
import { lookSquare } from '../sim/satellite';
import { useTier } from './tier';
import { Assets } from './Assets';
import { Recentre } from './Recentre';
import { MissionBar } from './MissionBar';
import { CommsPanel } from './CommsPanel';
import { AskWindow } from './AskWindow';
import { IntelStream, useAskHidden } from './IntelStream';
import { TeamPanel } from './TeamPanel';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'intel' | 'satcom' | 'team';

// The war room (ILI-1186): HQ sits down to a live, multi-panel view of the theater. The
// mission bar runs along the top; down the left the intel stream, with the comms log under it
// (ILI-1199); the map fills the rest. Along the bottom: the mini game and HQ's assets, then
// the team panel in the bottom-right corner. ORION-3, the imaging satellite, has no panel
// (ILI-1202): its status is a line in the header. Any square HQ works, picked on the map or
// opened from the stream, gets one card beside it (SquareCard, ILI-1203): its details, the
// scan, ORION-3's larger picture, and the strikes and support to call in there. When ALPHA needs something its ask pops up beside its marker
// (AskWindow). On a phone the stream, comms and team share one docked panel with tabs; on a
// fold or tablet they share a rail down the right, and an open square takes it over (ILI-1213).
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [tab, setTab] = useState<Tab>('team');
  const askHidden = useAskHidden(); // ALPHA's ask is raised in the stream: light its tab
  const tier = useTier();
  // What a docked square covers: the whole rail (medium), or the dock under its actions (compact).
  const cover = useGame((s) => {
    const sq = lookSquare(s);
    if (!sq || tier === 'wide') return undefined;
    return tier === 'medium' ? 'rail' : hasActions(s, sq) ? 'dock' : undefined;
  });
  // On a phone the dock follows the action. A square picked on the map opens its zoomed view
  // on the map itself (ILI-1201), so the dock stays where it is.
  // New events run inline in the intel stream (ILI-1197): a new one brings it forward.
  const fresh = useGame((s) => s.events.filter((e) => e.status === 'new').length);
  useEffect(() => {
    if (fresh) setTab('intel');
  }, [fresh]);

  return (
    <div className="hud" data-playing={playing} data-tab={tab} data-tier={tier} data-cover={cover}>
      <div className="slot-bar">
        <MissionBar />
      </div>
      <div className="slot-stream">
        <IntelStream />
      </div>
      <MapArea />
      <SquareCard />
      <div className="slot-band">
        <div className="band-cards">
          <MiniGamePanel />
        </div>
        <div className="map-controls">
          <Recentre />
          <Assets />
        </div>
      </div>
      <div className="slot-team">
        <TeamPanel />
      </div>
      <div className="slot-satcom">
        <CommsPanel />
      </div>
      <nav className="dock-tabs" aria-label="Panels">
        {(['intel', 'satcom', 'team'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`} data-alert={t === 'intel' && askHidden && tab !== 'intel'}>
            {t === 'satcom' ? 'COMMS' : t.toUpperCase()}
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
