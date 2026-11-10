import { useEffect, useState } from 'react';
import { toScreen } from '../game/events';
import { game, useGame } from '../sim/store';
import { targets } from '../sim/imagery';
import type { Sighting } from '../sim/sightings';
import { OperatorRow } from './OperatorRow';
import { panelled, pins, usePins } from './pins';

// Panels over bracketed things (ILI-1411): hover one for a mini panel beside it; click it and
// the panel pins, floating with it on a 1px line; click it again (or ✕) and it goes. Any
// number can be pinned. A panel lasts only while its thing has brackets (ILI-1410).
const OFFSET = { x: 18, y: -18 }; // up and to the right of the thing, CSS px

export function SightingPanels() {
  const { hovered, pinned } = usePins();
  const running = useGame((s) => s.phase === 'running' || s.phase === 'paused');
  // Follow the map every frame: the things move, and so does the camera.
  const [, frame] = useState(0);
  const open = hovered || pinned.length;
  useEffect(() => {
    if (!open) return;
    let id = requestAnimationFrame(function tick() {
      frame((n) => n + 1);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);
  if (!running || !open) return null;

  const seen = new Map(pins.seen().filter(panelled).map((t) => [t.id, t]));
  const ids = [...pinned, ...(hovered && !pinned.includes(hovered) ? [hovered] : [])].filter((id) => seen.has(id));
  const placed = ids.flatMap((id) => {
    const t = seen.get(id)!;
    const at = toScreen(t.x, t.y);
    return at ? [{ t, at, pin: pinned.includes(id) }] : [];
  });
  return (
    <div className="sighting-layer" data-testid="sighting-panels">
      <svg className="sighting-lines" aria-hidden>
        {placed
          .filter((p) => p.pin)
          .map(({ t, at }) => (
            <line key={t.id} x1={at.x} y1={at.y} x2={at.x + OFFSET.x} y2={at.y + OFFSET.y} />
          ))}
      </svg>
      {placed.map(({ t, at, pin }) => (
        <section
          key={t.id}
          className="sighting-panel"
          data-kind={t.kind}
          data-pinned={pin || undefined}
          data-ghost={t.age === 'ghost' || undefined}
          data-testid={`panel-${t.id}`}
          style={{ left: at.x + OFFSET.x, top: at.y + OFFSET.y }}
        >
          <PanelBody t={t} />
          {pin && (
            <button className="sp-close" onClick={() => pins.toggle(t.id)} aria-label="Close" data-testid="panel-close">
              ✕
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

function PanelBody({ t }: { t: Sighting }) {
  const s = useGame((x) => x);
  if (t.kind === 'operator') {
    const o = s.team.operators.find((x) => `op:${x.id}` === t.id);
    return o ? (
      <ul className="readout">
        <OperatorRow o={o} />
      </ul>
    ) : null;
  }
  if (t.kind === 'hostile') {
    const contactId = t.id.split(':')[0];
    const strikeable = targets(s).some((x) => x.contactId === contactId);
    return (
      <>
        <h3 className="sp-title hostile">HOSTILE</h3>
        <p className="sp-line">{t.square}</p>
        {strikeable && (
          <button className="sp-act" onClick={() => game.openEvent(`contact-${contactId}`)} data-testid="panel-strike">
            Strike
          </button>
        )}
      </>
    );
  }
  if (t.kind === 'site')
    return (
      <>
        <h3 className="sp-title hostile">KILL SITE</h3>
        <p className="sp-line">{t.square}</p>
      </>
    );
  return (
    <>
      <h3 className="sp-title">WRECK · BLACK BOX</h3>
      <p className="sp-line">{t.square}</p>
    </>
  );
}
