import { useEffect, useRef, useState } from 'react';
import { DebugPanel } from './DebugPanel';
import { game, useGame } from '../sim/store';
import { MapArea } from './MapArea';
import { ExfilPanel } from './ExfilPanel';
import { SquareCard } from './SquareCard';
import { lookSquare } from '../sim/satellite';
import { useTier } from './tier';
import { BudgetChip, StartCard, TimerChip } from './MissionBar';
import { EnvWidget } from './EnvWidget';
import { OrionPanel } from './OrionPanel';
import { CommsPanel } from './CommsPanel';
import { HeartbeatStrip, TeamPanel } from './TeamPanel';
import { Recentre } from './Recentre';
import { bus, EV } from '../game/events';
import { PauseMenu } from './PauseMenu';
import { Intro } from './Intro';
import { firstBoot, useIntro } from './intro';
import { WrapUp } from './WrapUp';
import { PromptLayer } from './PromptLayer';
import { useFlash, useUnseen } from './attention';
import { currentCall } from '../sim/comms';

const debug = new URLSearchParams(location.search).has('debug');
// Tests and debugging drive the game directly through window.game when ?debug is on.
if (debug) Object.assign(window, { game });

type Tab = 'satcom' | 'orion' | 'team';
type Sheet = 'peek' | 'half' | 'full';
const SHEETS: Sheet[] = ['peek', 'half', 'full'];

// The war room (layout A, ILI-1226, reworked by the HUD tiers, ILI-1391 to ILI-1395). The map runs
// edge to edge on the left; ORION-3 and INTEL down the right; TEAM along the bottom.
// Tier one, always on and small: the timer in the map's corner (ILI-1392); ALPHA's status on its
// marker (ILI-1395). Tier two: the one prompt on the map (PromptLayer). Tier three, opened by HQ:
// the comms log (ILI-1393). The budget sits beside the clock (ILI-1405). A square HQ picks gets its menu flush with
// its edge (SquareCard), its details in ORION-3's panel. On a fold or tablet COMMS, ORION-3 and
// TEAM share a rail down the right behind tabs (ILI-1213); on a phone they share a bottom sheet.
export function Hud() {
  const playing = useGame((s) => s.minigame?.status === 'active');
  // ORION-3 first: the team panel is a drawer now (ILI-1396), closed until HQ opens it.
  const [tab, setTab] = useState<Tab>('orion');
  const [teamOpen, setTeamOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  // On a wide screen the log is a drawer over the map's left edge, behind one small button (ILI-1393).
  const [log, setLog] = useState(false);

  const tier = useTier();
  const satellite = useGame((s) => s.mission.satellite); // its name, from the mission's config (ILI-1401)
  // The panels power on in turn as the war room comes online (ILI-1281), on the way in and on a
  // restart (intro.ts).
  const stage = useIntro();
  const boot = stage === 'panels' || stage === 'link';
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
  const tabbed = tier !== 'wide';
  const shown = (t: Tab) => !tabbed || (tab === t && !(tier === 'compact' && sheet === 'peek'));
  const commsNews = useGame((s) => s.comms.messages.length + s.stream.items.length);
  const orionNews = useGame((s) => `${s.satellite.state}|${s.satellite.aim}|${s.satellite.result ? 'look' : ''}`);
  const calling = useGame((s) => !!currentCall(s.comms));
  const unseen = { satcom: useUnseen(commsNews, tabbed ? shown('satcom') : log), orion: useUnseen(orionNews, shown('orion')), team: false };
  const satcomSlot = useRef<HTMLDivElement>(null);
  const orionSlot = useRef<HTMLDivElement>(null);
  useFlash(satcomSlot, commsNews, tabbed ? shown('satcom') : log);
  useFlash(orionSlot, orionNews, shown('orion'));
  const pick = (t: Tab) => {
    // A tab always shows its panel: a folded sheet opens. Folding is the handle's job.
    setSheet((h) => (h === 'peek' ? 'half' : h));
    setTab(t);
  };
  // The heartbeat strip opens the team drawer (ILI-1396); an operator prompt opens it with them
  // highlighted. On a fold or phone the drawer is the TEAM tab.
  const openTeam = (id: string | null = null) => {
    setHighlight(id);
    if (tabbed) pick('team');
    else setTeamOpen(true);
  };
  const toggleTeam = () => {
    setHighlight(null);
    if (tabbed) return tab === 'team' && shown('team') ? pick('orion') : pick('team');
    setTeamOpen((o) => !o);
  };
  useEffect(() => {
    const on = (id: string | null) => openTeam(id);
    bus.on(EV.openTeam, on);
    return () => void bus.off(EV.openTeam, on);
  });

  return (
    <div className="hud" data-boot={boot ? (firstBoot() ? 'first' : 'again') : undefined} data-playing={playing} data-tab={tab} data-tier={tier} data-sheet={sheet} data-picked={picked || undefined} data-log={log || undefined} data-team={teamOpen || undefined}>
      <div className="slot-widget">
        <TimerChip />
        <BudgetChip />
      </div>
      <StartCard />
      <MapArea />
      <SquareCard />
      <PromptLayer />
      <div className="slot-band">
        <div className="band-cards" data-overlay="band">
          <ExfilPanel />
        </div>
      </div>
      <Recentre />
      {tabbed && <HeartbeatStrip open={tab === 'team' && shown('team')} onToggle={toggleTeam} />}
      <div className="slot-orion" data-overlay="orion" ref={orionSlot}>
        <OrionPanel />
      </div>
      <div className="slot-bottom">
        {tier !== 'wide' && (
          <div className="slot-small" data-testid="small-widgets">
            <EnvWidget slim />
          </div>
        )}
        {/* The heartbeat strip, tier one; the team panel is its drawer (ILI-1396). */}
        <div className="slot-team" data-overlay={!tabbed && teamOpen ? 'team' : undefined}>
          {!tabbed && <HeartbeatStrip open={teamOpen} onToggle={toggleTeam} />}
          <TeamPanel highlight={highlight} />
        </div>
      </div>
      <div className="slot-satcom" ref={satcomSlot} data-overlay={!tabbed && log ? 'log' : undefined}>
        <CommsPanel />
      </div>
      {!tabbed && (
        <button className="log-toggle" data-overlay="logtoggle" onClick={() => setLog((o) => !o)} aria-expanded={log} data-testid="log-toggle" data-update={unseen.satcom || undefined}>
          Comms log
          {unseen.satcom && <span className="tab-dot" aria-hidden />}
        </button>
      )}
      {tier === 'compact' && <SheetHandle sheet={sheet} setSheet={setSheet} />}
      <nav className="dock-tabs" aria-label="Panels">
        {(['satcom', 'orion', 'team'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => (tier === 'compact' ? pick(t) : setTab(t))} data-testid={`tab-${t}`} data-alert={t === 'team' && calling && !shown('team')} data-update={unseen[t] || undefined}>
            {t === 'satcom' ? 'COMMS' : t === 'orion' ? satellite : t.toUpperCase()}
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
