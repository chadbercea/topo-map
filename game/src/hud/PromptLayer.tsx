import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { promptQueue, trafficPrompts, type Prompt } from '../sim/prompts';
import { lockedOn, satName } from '../sim/satellite';
import { strikeState } from './SquareCard';
import { AIR, airGone, arrived } from '../sim/air';
import { SNIPER_CALLSIGN, sniperGone } from '../sim/sniper';
import { countdown } from '../sim/gameTime';
import type { GameState } from '../sim/state';
import { alphaBox, overlaysNamed, pick, squareBox, type Box } from './overlays';
import { useTier } from './tier';

const W = 280; // the prompt's width on a wide screen
const GAP = 12; // between the prompt and its square

// Tier two on screen (ILI-1391): the one prompt at the head of the queue, pinned to its square on
// the map and following it as the map pans and zooms. The loudest thing on screen: one line
// saying what's happening and its responses. The rest wait their turn; a count says how many.
// Enemy traffic has its own lane beside it (ILI-1452): a small card nothing replaces.
export function PromptLayer() {
  return (
    <>
      <MainPrompt />
      <TrafficPrompts />
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
  const strip = overlaysNamed(['actions', 'toolbox', 'widget', 'logtoggle', 'log', 'heartbeats', 'team', 'recentre']); // the square's menu, the toolbox, the timer (ILI-1392), the log (ILI-1393)
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

const TW = 210; // the traffic card's width: smaller than the prompt, out of its way (ILI-1452)

// Enemy traffic (ILI-1452): a compact card pinned to the traffic's square, apart from the one
// prompt so nothing knocks it off mid-read. It stays until HQ acts on it or dismisses it.
function TrafficPrompts() {
  const s = useGame((x) => x);
  return (
    <>
      {trafficPrompts(s).map((p) => (
        <TrafficPrompt key={p.id} live={p} team={s.team.position} />
      ))}
    </>
  );
}

function TrafficPrompt({ live, team }: { live: Prompt; team: { x: number; y: number } }) {
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
  const [, redraw] = useState(0);
  // While the pointer is on it, it holds still: same words, same spot, until HQ clicks.
  const [hover, setHover] = useState(false);
  const held = useRef<{ p: Prompt; at: Box } | null>(null);
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    bus.on(EV.camera, again);
    bus.on(EV.mapRect, again);
    bus.on(EV.overlays, again);
    return () => {
      bus.off(EV.camera, again);
      bus.off(EV.mapRect, again);
      bus.off(EV.overlays, again);
    };
  }, []);
  // The one prompt moved or came up: get out of its way (it's placed first, so this settles).
  const seen = useRef('');
  useLayoutEffect(() => {
    const now = ref.current?.offsetHeight ?? 0;
    if (now && Math.abs(now - h) > 1) setH(now);
    const main = JSON.stringify(overlaysNamed(['prompt']));
    if (main !== seen.current) {
      seen.current = main;
      redraw((n) => n + 1);
    }
  });

  const area = getMapRect();
  if (!area) return null;
  const width = Math.min(TW, area.width - 16);
  let p = live;
  let at: Box;
  if (hover && held.current) ({ p, at } = held.current);
  else {
    // Clear of the one prompt, the square's menu, the toolbox, the timer, the log and ALPHA.
    const strip = overlaysNamed(['prompt', 'actions', 'toolbox', 'widget', 'logtoggle', 'log', 'heartbeats', 'team', 'recentre']);
    at = place(squareBox(p.square), area, width, h || 72, [alphaBox(team), ...strip]);
    held.current = { p, at };
  }
  const sq = squareBox(p.square);
  const target = sq ? { x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 } : null;
  const near = target && { x: Math.max(at.x, Math.min(target.x, at.x + width)), y: Math.max(at.y, Math.min(target.y, at.y + (h || 72))) };

  return (
    <>
      {target && near && (
        <svg className="prompt-leader traffic-leader" aria-hidden>
          <line x1={near.x} y1={near.y} x2={target.x} y2={target.y} />
          <circle cx={target.x} cy={target.y} r="3" />
        </svg>
      )}
      <section
        ref={ref}
        className="traffic-prompt"
        data-testid="traffic-prompt"
        data-overlay="traffic"
        data-kind={p.kind}
        data-square={p.square}
        style={{ left: at.x, top: at.y, width }}
        role="dialog"
        aria-label={p.text}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <p className="prompt-text" data-testid="prompt-text">
          <b>{p.square}</b> {p.text}
        </p>
        <button className="traffic-dismiss" onClick={() => game.dismissTraffic(p.id)} data-testid="traffic-dismiss" aria-label="Dismiss">
          ✕
        </button>
        <div className="prompt-responses">
          {p.responses.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                held.current = null; // what HQ just did shows straight away
                game.answerPrompt(p.id, r.id);
              }}
              disabled={r.disabled}
              data-response={r.id}
              data-testid="prompt-response"
            >
              {r.label}
            </button>
          ))}
          {/* Jam is here too (ILI-1469): the traffic's own tag has both answers. It needs ORION-3
              over the square, like everything that runs there (ILI-1397). */}
          <JamButton id={p.id} square={p.square} onAct={() => (held.current = null)} />
        </div>
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

function JamButton({ id, square, onAct }: { id: string; square: string; onAct: () => void }) {
  const locked = useGame((s) => lockedOn(s, square));
  const name = useGame(satName);
  return (
    <button
      className="jam"
      onClick={() => {
        onAct();
        game.jam(id);
      }}
      disabled={!locked}
      title={locked ? "Slows the enemy, but you won't learn what they're planning" : `${name} has to be over ${square}`}
      data-testid="traffic-jam"
    >
      Jam
    </button>
  );
}

// Callout tags (ILI-1469, the ILI-1459 design): a thing on the map HQ can act on gets a tag at its
// square, like the red map's cars: a dot on the square, a short leader, and the tag with its own
// button. A building worth a search gets Search; once ALPHA is on its way, the tag says so.
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
  const buildings = s.events.filter((e) => e.kind === 'building' && e.status !== 'resolved');
  // CONTACT tags (ILI-1474): a square whose fresh look shows fighters, or with a strike under way.
  const contactSquares = [...new Set(s.events.filter((e) => e.kind === 'contact' && e.status !== 'resolved').map((e) => e.square))];
  return (
    <>
      {contactSquares.map((square) => {
        const st = strikeState(s, square);
        const work = strikeWork(s, square);
        if (!st.seen && !work) return null;
        const sq = squareBox(square);
        if (!sq) return null;
        const cx = sq.x + sq.w / 2;
        const cy = sq.y + sq.h * 0.25;
        if (cx < area.x || cx > area.x + area.width || cy < area.y || cy > area.y + area.height) return null;
        const open = s.events.some((e) => e.id === s.openEvent && e.kind === 'contact' && e.square === square);
        return (
          <div key={`contact-${square}`} className="place-tag contact-tag" data-testid="contact-tag" data-kind="contact" data-square={square} data-open={open || undefined} style={{ left: cx, top: cy }}>
            <i className="pt-dot" aria-hidden />
            <i className="pt-lead" aria-hidden />
            <div className="pt-tag" role="group" aria-label={`Contact · ${square}`}>
              <span>
                Contact · {square}
                {st.marked.length > 0 && <b data-testid="contact-count"> · {st.marked.length}</b>}
              </span>
              {work ? (
                <em data-testid="strike-work">{work}</em>
              ) : (
                <button
                  onClick={() => st.strikes[0] && (open ? game.dropEvent() : game.openEvent(st.strikes[0].id))}
                  disabled={!st.can}
                  title={st.can ? `Strike ${square}` : `${satName(s)} has to be over ${square} to watch the strike land`}
                  data-testid="contact-strike"
                  aria-expanded={open}
                >
                  Strike
                </button>
              )}
            </div>
          </div>
        );
      })}
      {buildings.map((e) => {
        const sq = squareBox(e.square);
        if (!sq) return null;
        const cx = sq.x + sq.w / 2;
        const cy = sq.y + sq.h / 2;
        if (cx < area.x || cx > area.x + area.width || cy < area.y || cy > area.y + area.height) return null;
        const going = s.searching.includes(e.square);
        return (
          <div key={e.id} className="place-tag" data-testid="place-tag" data-kind={e.kind} data-square={e.square} style={{ left: cx, top: cy }}>
            <i className="pt-dot" aria-hidden />
            <i className="pt-lead" aria-hidden />
            <div className="pt-tag" role="group" aria-label={`${e.title} · ${e.square}`}>
              <span>Building · {e.square}</span>
              {going ? (
                <em data-testid="search-going">{s.team.callsign} on its way</em>
              ) : (
                <button onClick={() => game.search(e.square)} data-testid="send-search">
                  Search
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// What's hitting a square right now, for its CONTACT tag (ILI-1474): the asset's callsign and how
// it's going.
function strikeWork(s: GameState, square: string): string | null {
  const now = s.elapsedMs;
  if (s.sniper && s.sniper.square === square && !sniperGone(s.sniper, now)) return `${SNIPER_CALLSIGN} · ${s.sniper.done ? 'done' : 'firing'}`;
  for (const w of ['drone', 'heli'] as const) {
    const r = w === 'drone' ? s.drone : s.heli;
    if (r && r.square === square && !airGone(r, now)) return `${AIR[w].callsign} · ${r.doneMs !== null ? 'done' : arrived(r, now) ? 'over target' : countdown(r.arriveMs - now)}`;
  }
  return null;
}
