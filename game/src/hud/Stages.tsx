import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// The square panel's stages (ILI-1514): its report, then the strike options, then the strike
// under way (the selected asset and its time to target). A new stage slides in from the right
// going forward and from the left going back, and the panel grows or shrinks to fit it rather
// than jumping. Off under reduced motion (styles.css).
export function Stages({ stage, order, children }: { stage: string; order: readonly string[]; children: ReactNode }) {
  const [height, setHeight] = useState<number | null>(null);
  const was = useRef(stage);
  const dir = useRef<'fwd' | 'back' | null>(null);
  if (was.current !== stage) {
    dir.current = order.indexOf(stage) >= order.indexOf(was.current) ? 'fwd' : 'back';
    was.current = stage;
  }
  // The stage's natural height, followed as it changes; the outer box eases to it. Measured on
  // screen, since the stage carries the HUD's zoom (--k) and the box doesn't.
  const sizes = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    sizes.current?.disconnect();
    if (!el) return;
    const read = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    read();
    sizes.current = new ResizeObserver(read);
    sizes.current.observe(el);
  }, []);
  useEffect(() => () => sizes.current?.disconnect(), []);
  return (
    <div className="sc-stages" data-testid="strike-stages" data-stage={stage} style={height === null ? undefined : { height }}>
      <div key={stage} ref={measure} className="sc-stage" data-dir={dir.current ?? undefined}>
        {children}
      </div>
    </div>
  );
}
