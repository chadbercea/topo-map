import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus, EV, getMapRect } from '../game/events';
import { game, useGame } from '../sim/store';
import { promptQueue } from '../sim/prompts';
import { alphaBox, overlaysNamed, pick, squareBox, type Box } from './overlays';
import { useTier } from './tier';

const W = 280; // the prompt's width on a wide screen
const GAP = 12; // between the prompt and its square

// Tier two on screen (ILI-1391): the one prompt at the head of the queue, pinned to its square on
// the map and following it as the map pans and zooms. The loudest thing on screen: one line
// saying what's happening and its responses. The rest wait their turn; a count says how many.
export function PromptLayer() {
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
  const sq = squareBox(p.square);
  const width = Math.min(W, area.width - 16);
  // The prompt keeps clear of what never moves for it: the square's menu (flush with its square;
  // on a phone a strip along the map's foot), the toolbox, the timer and the log.
  const strip = overlaysNamed(['actions', 'toolbox', 'widget', 'logtoggle', 'log', 'heartbeats', 'team', 'recentre']); // the square's menu, the toolbox, the timer (ILI-1392), the log (ILI-1393)
  const at = place(sq, area, width, h || 96, [alphaBox(s.team.position), ...strip]);
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
