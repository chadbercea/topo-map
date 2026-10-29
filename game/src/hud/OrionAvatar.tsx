import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarState } from './orionScene'; // a type only: the module itself loads lazily

// ORION-3 in 3D (ILI-1196): a small low-poly wireframe of the imaging satellite, turning slowly in
// the ORION-3 placeholder. Three.js loads on demand so the main bundle doesn't carry it; until it
// does, or when WebGL isn't there, the still SVG mark (`fallback`) shows instead.

export function OrionAvatar({ state, fallback }: { state: AvatarState; fallback: ReactNode }) {
  return <WireAvatar state={state} fallback={fallback} load={loadOrion} className="o-sat-3d" />;
}
const loadOrion = () => import('./orionScene');

type Mount<S> = (host: HTMLElement, stateRef: { current: S }, repaint: { current: (() => void) | null }) => (() => void) | null;

// Any of the HUD's wireframes (ILI-1236 shares this with COMMS's terminal): `load` imports its
// scene module, whose `mount` builds and runs it.
export function WireAvatar<S>({ state, fallback, load, className }: { state: S; fallback: ReactNode; load: () => Promise<{ mount: Mount<S> }>; className: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const repaint = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  // The state changes the colour and speed in place; no new scene.
  useEffect(() => {
    stateRef.current = state;
    repaint.current?.();
  }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let stop = () => {};
    load()
      .then(({ mount }) => {
        if (dead) return;
        const built = mount(host, stateRef, repaint);
        if (!built) return; // no WebGL: the SVG mark stays
        stop = built;
        setReady(true);
      })
      .catch(() => {}); // the chunk failed to load: the SVG mark stays
    return () => {
      dead = true;
      stop();
      repaint.current = null;
    };
  }, [load]);

  return (
    <div ref={hostRef} className={className} data-ready={ready || undefined} aria-hidden>
      {!ready && fallback}
    </div>
  );
}
