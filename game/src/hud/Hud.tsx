import { useEffect, useRef, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { MiniGamePanel } from './MiniGamePanel';
import { hasActions, SquareCard } from './SquareCard';
import { lookSquare } from '../sim/satellite';
import { useTier } from './tier';
import { alphaBox, overlap } from './overlays';
import { bus, EV } from '../game/events';
import { Assets } from './Assets';
import { Recentre } from './Recentre';
import { MissionStrip, StatusWidget } from './MissionBar';
import { CommsPanel } from './CommsPanel';
import { AskWindow } from './AskWindow';
import { useAskHidden } from './CommsPanel';
import { TeamPanel } from './TeamPanel';
import { PauseMenu } from './PauseMenu';
import { WrapUp } from './WrapUp';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'satcom' | 'team';
type Sheet = 'peek' | 'half' | 'full';
const SHEETS: Sheet[] = ['peek', 'half', 'full'];

// The war room (ILI-1186): HQ sits down to a live, multi-panel view of the theater. The clock,
// weather and ORION-3 sit in a widget in the map's top-right corner, and the mission's status
// runs along the map's foot (ILI-1216); down the left COMMS, HQ's one feed since the intel
// stream went (ILI-1199, ILI-1225); the map fills the rest. Along the bottom: the mini game and HQ's assets, then
// the team panel in the bottom-right corner. ORION-3, the imaging satellite, has no panel
// (ILI-1202): its status is a line in the header. Any square HQ works, picked on the map or
// named in COMMS, gets one card beside it (SquareCard, ILI-1203): its details, the
// scan, ORION-3's larger picture, and the strikes and support to call in there. When ALPHA needs something its ask pops up beside its marker
// (AskWindow). On a phone COMMS and the team share one docked panel with tabs; on a
// fold or tablet they share a rail down the right, and an open square takes it over (ILI-1213).
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [tab, setTab] = useState<Tab>('team');
  const askHidden = useAskHidden(); // ALPHA's ask is raised in COMMS: light its tab
  const tier = useTier();
  const flip = useBandFlip();
  // What a docked square covers: the whole rail (medium), or the dock under its actions (compact).
  const cover = useGame((s) => {
    const sq = lookSquare(s);
    if (!sq || tier === 'wide') return undefined;
    return tier === 'medium' ? 'rail' : hasActions(s, sq) ? 'dock' : undefined;
  });
  // On a phone the dock follows the action. A square picked on the map opens its zoomed view
  // on the map itself (ILI-1201), so the dock stays where it is.
  // A new event marks its square on the map, and its report lands in COMMS (ILI-1225): that
  // brings COMMS forward.
  const fresh = useGame((s) => s.events.filter((e) => e.status === 'new').length);
  // On a phone the dock is a bottom sheet (ILI-1214): peek (just the tabs), half or full.
  const [sheet, setSheet] = useState<Sheet>('half');
  useEffect(() => {
    if (fresh) {
      setTab('satcom');
      setSheet((h) => (h === 'peek' ? 'half' : h)); // news opens a peeking sheet
    }
  }, [fresh]);
  const pick = (t: Tab) => {
    // A tab always shows its panel: a folded sheet opens. Folding is the handle's job.
    setSheet((h) => (h === 'peek' ? 'half' : h));
    setTab(t);
  };

  return (
    <div className="hud" data-playing={playing} data-tab={tab} data-tier={tier} data-cover={cover} data-sheet={sheet}>
      <div className="slot-widget">
        <StatusWidget />
      </div>
      <div className="slot-strip">
        <MissionStrip />
      </div>
      <MapArea />
      <SquareCard />
      <div className="slot-band" data-flip={flip}>
        <div className="band-cards" data-overlay="band">
          <MiniGamePanel />
        </div>
        <div className="map-controls" data-overlay="band">
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
      {tier === 'compact' && <SheetHandle sheet={sheet} setSheet={setSheet} />}
      <nav className="dock-tabs" aria-label="Panels">
        {(['satcom', 'team'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => (tier === 'compact' ? pick(t) : setTab(t))} data-testid={`tab-${t}`} data-alert={t === 'satcom' && askHidden && tab !== 'satcom'}>
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

// The band (HQ's assets, a mini game) sits at a corner of the map's foot; when ALPHA walks
// under it, it moves to the other side (ILI-1215). Checked a frame after the camera moves.
function useBandFlip() {
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    let frame = 0;
    let last = -Infinity;
    const check = () => {
      const alpha = alphaBox(game.get().team.position);
      const r = document.querySelector('.map-controls')?.getBoundingClientRect();
      // At most every few seconds, so it can't flicker when ALPHA is under both spots.
      if (!alpha || !r?.width || performance.now() - last < 3000) return;
      if (overlap(alpha, { x: r.x, y: r.y, w: r.width, h: r.height }) > 0) {
        last = performance.now();
        setFlip((f) => !f);
      }
    };
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    bus.on(EV.camera, again);
    const every = setInterval(check, 500); // ALPHA walks while the camera stays put
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(every);
      bus.off(EV.camera, again);
    };
  }, []);
  return flip;
}
