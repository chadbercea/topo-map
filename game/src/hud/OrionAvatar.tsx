import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarState } from './orionScene'; // a type only: the module itself loads lazily

// ORION-3 in 3D (ILI-1196): a small low-poly wireframe of the imaging satellite, turning slowly in
// the ORION-3 placeholder. Three.js loads on demand so the main bundle doesn't carry it; until it
// does, or when WebGL isn't there, the still SVG mark (`fallback`) shows instead.

export function OrionAvatar({ state, fallback }: { state: AvatarState; fallback: ReactNode }) {
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
    import('./orionScene')
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
  }, []);

  return (
    <div ref={hostRef} className="o-sat-3d" data-ready={ready || undefined} aria-hidden>
      {!ready && fallback}
    </div>
  );
}
