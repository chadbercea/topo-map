import { useEffect, useRef, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { ExfilPanel } from './ExfilPanel';
import { ResupplyPanel } from './ResupplyPanel';
import { SquareCard } from './SquareCard';
import { StrikeAlerts } from './StrikeAlert';
import { lookSquare } from '../sim/satellite';
import { useTier, useFold } from './tier';
import { MissionBar } from './MissionBar';
import { ChipStatus } from './ChipStatus';
import { CommsLine } from './CommsLine';
import { SightingPanels } from './SightingPanels';
import { OrionPanel } from './OrionPanel';
import { CommsPanel } from './CommsPanel';
import { HeartbeatStrip, TeamPanel } from './TeamPanel';
import { Recentre } from './Recentre';
import { bus, EV } from '../game/events';
import { PauseMenu } from './PauseMenu';
import { Intro } from './Intro';
import { useIntro } from './intro';
import { WrapUp } from './WrapUp';
import { PromptLayer } from './PromptLayer';
import { useFlash, useUnseen, useUnseenCount } from './attention';
import { currentCall, kindOf } from '../sim/comms';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'satcom' | 'orion' | 'team';
type Sheet = 'peek' | 'half' | 'full';

// The war room (layout A, ILI-1226, reworked by the HUD tiers, ILI-1391 to ILI-1395). The map runs
// edge to edge on the left; ORION-3 and INTEL down the right; TEAM along the bottom.
// Tier one, always on and small: the timer in the map's corner (ILI-1392); ALPHA's status on its
// marker (ILI-1395). Tier two: the one prompt on the map (PromptLayer). Tier three, opened by HQ:
// the comms log (ILI-1393). The budget sits beside the clock (ILI-1405). A square HQ picks gets its menu flush with
// its edge (SquareCard), its details in ORION-3's panel. On a fold or tablet COMMS, ORION-3 and
// TEAM share a rail down the right behind tabs (ILI-1213); on a phone they share a bottom sheet.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [tab, setTab] = useState<Tab>('orion');
  const [teamOpen, setTeamOpen] = useState(true); // ALPHA's table opens expanded (ILI-1501); HQ folds it to the bar
  const [highlight, setHighlight] = useState<string | null>(null);
  // On a wide screen the log is a drawer over the map's left edge, behind one small button (ILI-1393).
  const [log, setLog] = useState(false);

  const tier = useTier();
  const fold = useFold(); // ILI-1461: ORION-3 docked under the map, the team and comms along the bottom
  const satellite = useGame((s) => s.mission.satellite); // its name, from the mission's config (ILI-1401)
  // The panels stay dark while the map boots, then power on in turn (ILI-1281, ILI-1462), on the
  // way in and on a restart (intro.ts).
  const stage = useIntro();
  const boot = stage === 'map' ? 'map' : stage === 'panels' ? 'first' : undefined;
  // On a phone the dock follows the action. A square picked on the map opens its zoomed view
  // on the map itself (ILI-1201), so the dock stays where it is.
  // A new event marks its square on the map, and its report lands in COMMS (ILI-1225): that
  // brings COMMS forward.
  // COMMS is a log drawer now, tier three (ILI-1393): it never opens on its own; news dots its tab.
  // On a phone the dock is a bottom sheet (ILI-1214): peek (just the tabs), half or full.
  // Folded to its tabs to start (ILI-1396): COMMS, ORION-3 and TEAM are drawers, closed until HQ opens one.
  const [sheet, setSheet] = useState<Sheet>('peek');
  // Tasking ORION-3 brings its panel forward on a fold or phone (ILI-1219).
  // So does picking a square: its details and Reposition are there (ILI-1228, ILI-1308).
  // Keyed on what changed, so a strike ending with a square still picked brings it back too.
  const tasked = useGame((s) => (lookSquare(s) ? `${lookSquare(s)}|${s.satellite.state}|${!!s.minigame}` : ''));
  useEffect(() => {
    if (tasked) {
      setTab('orion');
      // On a phone a picked square has the map to itself (below): its menu is the action.
      setSheet((h) => (h === 'peek' && !(tier === 'compact' && game.get().map.selected) ? 'half' : h));
    }
  }, [tasked]); // eslint-disable-line react-hooks/exhaustive-deps
  // A mini game plays at its square on the map (ILI-1367), and a picked square's menu works
  // there (ILI-1397): on a phone the sheet folds to give them the map, and comes back half open
  // when they're done.
  const minigame = useGame((s) => s.minigame?.status === 'active');
  const picked = useGame((s) => !!s.map.selected);
  const busyMap = useRef(false);
  useEffect(() => {
    const busy = minigame || picked;
    if (tier === 'compact' && busy !== busyMap.current) setSheet(busy ? 'peek' : (h) => (h === 'peek' ? 'half' : h)); // only on a change: it starts folded (ILI-1396)
    busyMap.current = busy;
  }, [minigame, picked, tier]);
  // News in a panel out of sight dots its tab; a panel in view flashes its frame (ILI-1287).
  // ALPHA waiting on HQ lights TEAM's tab whole: its call box is there.
  const tabbed = tier !== 'wide' && !fold;
  const shown = (t: Tab) => !tabbed || (tab === t && !(tier === 'compact' && sheet === 'peek'));
  const commsNews = useGame((s) => s.comms.messages.length + s.stream.items.length);
  const orionNews = useGame((s) => `${s.satellite.state}|${s.satellite.aim}|${s.satellite.result ? 'look' : ''}`);
  const calling = useGame((s) => !!currentCall(s.comms));
  // Only what moves the game forward lights COMMS up (ILI-1413): calls that need HQ's answer and
  // alerts, not routine chatter.
  const forward = useGame((s) => s.comms.messages.filter((m) => kindOf(m) !== 'log').length);
  const newComms = useUnseenCount(forward, tabbed ? shown('satcom') : log);
  const unseen = { satcom: newComms > 0, orion: useUnseen(orionNews, shown('orion')), team: false };
  const satcomSlot = useRef<HTMLDivElement>(null);
  const orionSlot = useRef<HTMLDivElement>(null);
  useFlash(satcomSlot, commsNews, tabbed ? shown('satcom') : log);
  useFlash(orionSlot, orionNews, shown('orion'));
  // On a phone the map takes the screen (ILI-1461): the panels are small targets along its foot.
  // A tap opens one; one is open at a time, so tapping another slides the open one down as the new
  // one slides up; × closes it.
  const [leaving, setLeaving] = useState<Tab | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 240);
    return () => clearTimeout(t);
  }, [leaving]);
  const pick = (t: Tab) => {
    if (tier === 'compact' && sheet !== 'peek' && tab !== t) setLeaving(tab);
    setSheet((h) => (h === 'peek' ? 'half' : h));
    setTab(t);
  };
  const closeSheet = () => {
    setLeaving(tab);
    setSheet('peek');
  };
  // The heartbeat strip opens the team drawer (ILI-1396); an operator prompt opens it with them
  // highlighted. On a fold or phone the drawer is the TEAM tab.
  const openTeam = (id: string | null = null) => {
    setHighlight(id);
    if (tabbed) pick('team');
    else {
      setTeamOpen(true);
      setLog(false); // one drawer at a time (ILI-1472)
    }
  };
  const toggleTeam = () => {
    setHighlight(null);
    if (tabbed) return tab === 'team' && shown('team') ? pick('orion') : pick('team');
    setTeamOpen((o) => !o);
    setLog(false); // one drawer at a time (ILI-1472)
  };
  // The comms log closes with Esc (which also pauses, ILI-1503) or a click on the map (ILI-1472).
  // ALPHA's table is open by default and stays open while HQ works the map (ILI-1501): only its
  // own handle folds it. Opening the comms log never folds it (ILI-1538).
  useEffect(() => {
    if (tabbed) return;
    const closeLog = () => setLog(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeLog();
    const canvas = document.getElementById('game');
    window.addEventListener('keydown', key);
    canvas?.addEventListener('pointerdown', closeLog);
    return () => {
      window.removeEventListener('keydown', key);
      canvas?.removeEventListener('pointerdown', closeLog);
    };
  }, [tabbed]);
  useEffect(() => {
    const on = (id: string | null) => openTeam(id);
    bus.on(EV.openTeam, on);
    return () => void bus.off(EV.openTeam, on);
  });

  return (
    <div className="hud" data-boot={boot} data-playing={playing} data-tab={tab} data-tier={tier} data-layout={fold ? 'fold' : undefined} data-sheet={sheet} data-leaving={leaving ?? undefined} data-picked={picked || undefined} data-log={log || undefined} data-team={teamOpen || undefined}>
      <div className="slot-widget" data-overlay="widget">
        <MissionBar />
      </div>
      <MapArea />
      <SquareCard />
      <StrikeAlerts />
      <PromptLayer />
      <SightingPanels />
      <div className="slot-band">
        <div className="band-cards" data-overlay="band">
          <ResupplyPanel />
          <ExfilPanel />
        </div>
      </div>
      <Recentre />
      {tabbed && <HeartbeatStrip open={tab === 'team' && shown('team')} onToggle={toggleTeam} />}
      <div className="slot-orion" data-overlay="orion" ref={orionSlot}>
        <OrionPanel />
      </div>
      <div className="slot-bottom">
        {/* The heartbeat strip, tier one; the team panel is its drawer (ILI-1396). */}
        <div className="slot-team" data-overlay={!tabbed && teamOpen ? 'team' : undefined}>
          {/* One panel, two display states (ILI-1439): expanded, or folded to the strip. */}
          <TeamPanel highlight={highlight} minimized={!tabbed && !teamOpen} onToggle={tabbed ? undefined : toggleTeam} />
        </div>
        {/* The comms strip (ILI-1470), beside the team: the latest radio line, and Log, which opens
            the comms log upward over the map. It replaces the log button in the map's corner. */}
        {!tabbed && (
          <div className="comms-strip" data-testid="comms-strip">
            <small>Comms</small>
            <CommsLine />
            <button className="log-toggle" data-overlay="logtoggle" onClick={() => setLog((o) => !o)} aria-expanded={log} data-testid="log-toggle" data-update={unseen.satcom || undefined}>
              Log
              {newComms > 0 && (
                <>
                  <span className="tab-dot" aria-hidden />
                  <b className="new-count" data-testid="comms-new">
                    {newComms} new
                  </b>
                </>
              )}
              <span aria-hidden>{log ? '▾' : '▴'}</span>
            </button>
            <div className="slot-satcom" ref={satcomSlot} data-overlay={log ? 'log' : undefined}>
              <CommsPanel />
            </div>
          </div>
        )}
      </div>
      {tabbed && (
        <div className="slot-satcom" ref={satcomSlot}>
          <CommsPanel />
        </div>
      )}
      {tier === 'compact' && sheet !== 'peek' && (
        <button className="sheet-close" onClick={closeSheet} data-testid="sheet-close" aria-label="Close the panel">
          ×
        </button>
      )}
      <nav className="dock-tabs" aria-label="Panels">
        {(tier === 'compact' ? (['orion', 'team', 'satcom'] as const) : (['satcom', 'orion', 'team'] as const)).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => (tier === 'compact' ? pick(t) : setTab(t))} data-testid={`tab-${t}`} data-alert={t === 'team' && calling && !shown('team')} data-update={unseen[t] || undefined}>
            {t === 'satcom' ? 'COMMS' : t === 'orion' ? satellite : t.toUpperCase()}
            {tier === 'compact' && <ChipStatus tab={t} />}
            {unseen[t] && <span className="tab-dot" aria-hidden />}
          </button>
        ))}
      </nav>
      {debug && <DebugPanel />}
      <PauseMenu />
      <Intro />
      <WrapUp />
    </div>
  );
}

