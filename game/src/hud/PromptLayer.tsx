import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { promptQueue } from '../sim/prompts';
import { searchingIn } from '../sim/buildings';
import { exfilLocked } from '../sim/mission';
import { AIR, airGone, arrived } from '../sim/air';
import { SNIPER_CALLSIGN, sniperGone } from '../sim/sniper';
import { countdown } from '../sim/gameTime';
import type { GameState } from '../sim/state';
import { shownEvents } from '../sim/events';
import { alphaBox, overlaysNamed, pick, squareBox, type Box } from './overlays';
import { useTier } from './tier';

const W = 280; // the prompt's width on a wide screen
const GAP = 12; // between the prompt and its square

// Tier two on screen (ILI-1391): the one prompt at the head of the queue, pinned to its square on
// the map and following it as the map pans and zooms. The loudest thing on screen: one line
// saying what's happening and its responses. The rest wait their turn; a count says how many.
// Enemy traffic is a line of its square's intel list now (ILI-1491): no card or tag of its own.
export function PromptLayer() {
  return (
    <>
      <MainPrompt />
      <PlaceTags />
    </>
  );
}

function MainPrompt() {
  const s = useGame((x) => x);
  const queue = promptQueue(s);
  const p = queue[0];
  const tier = useTier();
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
  const [w, setW] = useState(0); // the grid tag's width (ILI-1450)
  const [, redraw] = useState(0);
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    bus.on(EV.camera, again);
    bus.on(EV.mapRect, again);
    bus.on(EV.overlays, again); // the square's menu moved: keep clear of it
    return () => {
      bus.off(EV.camera, again);
      bus.off(EV.mapRect, again);
      bus.off(EV.overlays, again);
    };
  }, []);
  useLayoutEffect(() => {
    const now = ref.current?.offsetHeight ?? 0;
    if (now && Math.abs(now - h) > 1) setH(now);
    const wide = ref.current?.offsetWidth ?? 0;
    if (wide && Math.abs(wide - w) > 1) setW(wide);
  });

  const area = getMapRect();
  if (!p || !area) return null;
  // ALPHA needs intel (ILI-1450, ILI-1451): no card and no button. A small tag on the edge of the
  // grid square it needs (outlined on the map) says the next step; the player does each one.
  if (p.kind === 'intel-needed') {
    const sq = squareBox(p.square);
    const tw = w || 200;
    const th = h || 24;
    const cx = sq ? sq.x + sq.w / 2 : area.x + area.width / 2;
    const above = sq ? sq.y - 6 - th : area.y + 8;
    const y = sq && above < area.y + 8 ? sq.y + sq.h + 6 : above; // under the square when there's no room above
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className="prompt-tag"
        data-testid="prompt"
        data-overlay="prompt"
        data-kind={p.kind}
        data-square={p.square}
        data-step={p.step}
        data-tier={tier}
        style={{ left: Math.max(area.x + 8, Math.min(cx - tw / 2, area.x + area.width - 8 - tw)), top: Math.max(area.y + 8, Math.min(y, area.y + area.height - 8 - th)) }}
        role="status"
        aria-label={`${p.text}. ${p.hint}`}
      >
        <span data-testid="prompt-text">{p.hint}</span>
      </div>
    );
  }
  // A prompt with no place of its own (an operator hit, a team call) sits on the team dock, not on
  // the map (ILI-1470): right over the team panel's header, no leader.
  const team = tier === 'wide' && (p.kind === 'operator' || p.kind === 'team-call') ? document.querySelector('.slot-team')?.getBoundingClientRect() : null;
  const sq = team ? null : squareBox(p.square);
  const width = Math.min(team ? Math.min(W + 60, team.width) : W, area.width - 16);
  // The prompt keeps clear of what never moves for it: the square's menu (flush with its square;
  // on a phone a strip along the map's foot), the toolbox, the timer and the log.
  const strip = overlaysNamed(['actions', 'strike', 'alert', 'toolbox', 'widget', 'logtoggle', 'log', 'heartbeats', 'team', 'recentre']); // the square's menu, the toolbox, the timer (ILI-1392), the log (ILI-1393)
  const at = team ? { x: team.left, y: team.top - 8 - (h || 96), w: width, h: h || 96 } : place(sq, area, width, h || 96, [alphaBox(s.team.position), ...strip]);
  const target = sq ? { x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 } : null;
  const near = target && { x: Math.max(at.x, Math.min(target.x, at.x + width)), y: Math.max(at.y, Math.min(target.y, at.y + (h || 96))) };

  return (
    <>
      {target && near && (
        <svg className="prompt-leader" aria-hidden>
          <line x1={near.x} y1={near.y} x2={target.x} y2={target.y} />
          <circle cx={target.x} cy={target.y} r="4" />
        </svg>
      )}
      <section
        ref={ref}
        className="prompt"
        data-testid="prompt"
        data-overlay="prompt"
        data-kind={p.kind}
        data-square={p.square}
        data-tier={tier}
        data-docked={team ? 'team' : undefined}
        style={{ left: at.x, top: at.y, width }}
        role="alertdialog"
        aria-label={p.text}
      >
        <p className="prompt-text" data-testid="prompt-text">
          <b>{p.square}</b> {p.text}
        </p>
        <div className="prompt-responses">
          {p.responses.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                game.answerPrompt(p.id, r.id);
                if (p.kind === 'operator') bus.emit(EV.openTeam, p.operator); // the team drawer, them highlighted (ILI-1396)
              }} disabled={r.disabled} data-response={r.id} data-testid="prompt-response">
              {r.label}
            </button>
          ))}
        </div>
        {queue.length > 1 && (
          <small className="prompt-waiting" data-testid="prompt-waiting">
            +{queue.length - 1} waiting
          </small>
        )}
      </section>
    </>
  );
}

// Above its square, else below, else either side; kept inside the open map and off ALPHA.
function place(sq: Box | null, area: { x: number; y: number; width: number; height: number }, w: number, h: number, avoid: (Box | null)[]): Box {
  const clampX = (x: number) => Math.max(area.x + 8, Math.min(x, area.x + area.width - 8 - w));
  const clampY = (y: number) => Math.max(area.y + 8, Math.min(y, area.y + area.height - 8 - h));
  if (!sq) return { x: clampX(area.x + (area.width - w) / 2), y: area.y + 8, w, h };
  const cx = sq.x + sq.w / 2 - w / 2;
  const cy = sq.y + sq.h / 2 - h / 2;
  const spots = [
    { x: clampX(cx), y: clampY(sq.y - GAP - h), w, h },
    { x: clampX(cx), y: clampY(sq.y + sq.h + GAP), w, h },
    { x: clampX(sq.x + sq.w + GAP), y: clampY(cy), w, h },
    { x: clampX(sq.x - GAP - w), y: clampY(cy), w, h },
  ];
  // A crowded corner: further out, the leader line still reaches the square.
  for (const fy of [0.15, 0.5, 0.85]) for (const fx of [0.5, 0.2, 0.8]) spots.push({ x: clampX(area.x + area.width * fx - w / 2), y: clampY(area.y + area.height * fy - h / 2), w, h });
  return pick(spots, [...avoid, sq]);
}

// Callout tags (ILI-1469, the ILI-1459 design, after the red-map reference): a thing on the map HQ can
// act on gets a tag at its square: a dot on the square, a short leader, and the tag with its own
// button. A picked square's tags dock on its flyout's top edge instead (ILI-1475), so a tag never
// covers the square's report.
function PlaceTags() {
  const s = useGame((x) => x);
  const [, redraw] = useState(0);
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    bus.on(EV.camera, again);
    bus.on(EV.mapRect, again);
    return () => {
      bus.off(EV.camera, again);
      bus.off(EV.mapRect, again);
    };
  }, []);
  const area = getMapRect();
  if (!area) return null;
  const docked = s.map.selected;
  const at = (square: string, fy: number) => {
    const sq = squareBox(square);
    if (!sq || square === docked) return null;
    const p = { left: sq.x + sq.w / 2, top: sq.y + sq.h * fy };
    return p.left < area.x || p.left > area.x + area.width || p.top < area.y || p.top > area.y + area.height ? null : p;
  };
  return (
    <>
      {tagSquares(s).buildings.map((e) => {
        const p = at(e.square, 0.5);
        return (
          p && (
            <div key={e.id} className="place-tag" data-testid="place-tag" data-kind={e.kind} data-square={e.square} style={p}>
              <i className="pt-dot" aria-hidden />
              <i className="pt-lead" aria-hidden />
              <BuildingTag id={e.id} />
            </div>
          )
        );
      })}
    </>
  );
}

// Which squares have tags: buildings worth a search (ILI-1469). Fighters get the square's ALERT
// instead (ILI-1524, StrikeAlert).
export function tagSquares(s: GameState) {
  const buildings = shownEvents(s).filter((e) => e.kind === 'building' && e.status !== 'resolved');
  return { buildings };
}

// A building's tag (ILI-1316, ILI-1469, ILI-1517): HQ posts its intel on the building for ALPHA
// to pull; then the tag is ALPHA's status on it: waiting on the shelf, downloading, on its way,
// or unable (ILI-1518), when HQ can post again.
const UNABLE_TAG = { contact: 'enemy in it', 'cut-off': 'no way round' } as const;
export function BuildingTag({ id }: { id: string }) {
  const s = useGame((x) => x);
  const e = s.events.find((x) => x.id === id);
  if (!e) return null;
  const who = s.team.callsign;
  const pkg = e.tasked ? s.intel.pushes.find((p) => p.id === e.tasked) : undefined;
  const status = searchingIn(s) === e.square
    ? `${who} searching`
    : s.searching.includes(e.square)
      ? `${who} on its way`
    : pkg?.state === 'posted'
      ? `Intel posted · waiting for ${who}`
      : pkg?.state === 'pulling'
        ? `${who} downloading intel`
        : null;
  const unable = !status && e.reach && e.reach !== 'going' ? `${who} unable · ${UNABLE_TAG[e.reach]}` : null;
  return (
    <div className="pt-tag" role="group" aria-label={`${e.title} · ${e.square}`}>
      <span>Building · {e.square}</span>
      {status ? (
        <em data-testid="building-status">{status}</em>
      ) : (
        <>
          {unable && <em data-testid="building-status">{unable}</em>}
          {exfilLocked(s) ? <em data-testid="building-status">Exfil · no search</em> : <button onClick={() => game.postBuilding(e.square)} title={`Post what HQ knows of the building for ${who} to pull`} data-testid="post-building">
            Post intel
          </button>}
        </>
      )}
    </div>
  );
}

// What's hitting a square right now, for its ALERT (ILI-1474, ILI-1524): the asset's callsign and
// how it's going.
export function strikeWork(s: GameState, square: string): string | null {
  const now = s.elapsedMs;
  if (s.sniper && s.sniper.square === square && !sniperGone(s.sniper, now)) return `${SNIPER_CALLSIGN} · ${s.sniper.done ? 'clear' : 'firing'}`;
  for (const w of ['drone', 'heli'] as const) {
    const r = w === 'drone' ? s.drone : s.heli;
    if (r && r.square === square && !airGone(r, now)) return `${AIR[w].callsign} · ${r.doneMs !== null ? 'clear' : arrived(r, now) ? 'over target' : countdown(r.arriveMs - now)}`;
  }
  return null;
}
