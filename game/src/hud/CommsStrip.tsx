import { useEffect, useRef } from 'react';
import { useGame } from '../sim/store';
import { kindOf, LINK_MS } from '../sim/comms';
import { gameSpan } from '../sim/gameTime';
import { WireAvatar } from './OrionAvatar';
import { linkTraffic } from './commsLink';
import { RELAY } from './CommsPanel';
import type { LinkState } from './terminalScene'; // a type only: the scene loads lazily

const TRAFFIC: Record<LinkState, string> = { idle: 'idle', incoming: 'incoming', sending: 'sending', tied: 'on hold' };

// The link's strip (ILI-1236), the sibling of ORION-3's (ILI-1235): ALPHA's SATCOM backpack (ILI-1246)
// in 3D on the left, and on the right the RELAY-7 link's signal trace and a little telemetry. All
// of it read off the game: a call coming in, HQ's answer up the link, the readback landing. It
// lives in TEAM's call box now (ILI-1255), out only while ALPHA's call is.
export function CommsStrip() {
  const traffic = useGame(linkTraffic);
  const calls = useGame((s) => s.comms.messages.filter((m) => kindOf(m) === 'call').length);
  const flying = useGame((s) => s.comms.inFlight.length);
  return (
    <div className="c-strip" data-testid="comms-avatar" data-state={traffic}>
      <WireAvatar state={traffic} fallback={<TerminalMark />} load={loadTerminal} className="c-terminal" />
      <div className="c-link">
        <LinkTrace traffic={traffic} calls={calls} flying={flying} />
        <dl className="c-telemetry">
          <div className="c-relay">
            <dt>Link</dt>
            <dd>{RELAY} · good</dd>
          </div>
          <div className="c-latency">
            <dt>Latency</dt>
            <dd>{gameSpan(LINK_MS)}</dd>
          </div>
          <div>
            <dt>Traffic</dt>
            <dd data-testid="comms-traffic">{TRAFFIC[traffic]}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
const loadTerminal = () => import('./terminalScene');

// The link's signal, scrolling right to left (ILI-1236): a low noise line when it's quiet; a
// green burst when a call of ALPHA's comes in; amber packets while HQ's answer is up the link;
// a short green blip when ALPHA reads it back. 2D canvas, at the 3D avatars' low frame rate,
// still with reduced motion, and paused when it can't be seen.
const FPS = 24;
const STEP = 2; // px per sample
type Ink = 0 | 1 | 2 | 3; // quiet, ALPHA's (green), HQ's (amber), held (dim)
type Burst = { ink: Ink; len: number; left: number };

function LinkTrace({ traffic, calls, flying }: { traffic: LinkState; calls: number; flying: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useRef(traffic);
  const burst = useRef<Burst | null>(null);
  const redraw = useRef<(() => void) | null>(null);
  const seen = useRef({ calls, flying });

  // A new call bursts in; an answer leaving the link (read back) blips.
  useEffect(() => {
    if (calls > seen.current.calls) burst.current = { ink: 1, len: 22, left: 22 };
    else if (flying < seen.current.flying) burst.current = { ink: 1, len: 8, left: 8 };
    seen.current = { calls, flying };
  }, [calls, flying]);
  useEffect(() => {
    mode.current = traffic;
    redraw.current?.();
  }, [traffic]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const css = getComputedStyle(canvas); // the call box inks it in the flag's orange
    const accent = css.getPropertyValue('--accent').trim() || '#35d0a5';
    const dim = css.getPropertyValue('--dim').trim() || '#6b7f76';
    const INKS = [accent, accent, '#f2c14e', dim];
    let vals: number[] = [];
    let inks: Ink[] = [];
    let w = 0;
    let h = 0;
    let i = 0;

    const sample = (): [number, Ink] => {
      i++;
      const noise = (Math.random() - 0.5) * 0.12;
      const b = burst.current;
      if (b && b.left > 0) {
        b.left--;
        const env = Math.sin((Math.PI * (b.len - b.left)) / b.len);
        return [(Math.random() * 2 - 1) * 0.9 * env, b.ink];
      }
      switch (mode.current) {
        case 'sending': // packets up the link
          return [((i >> 1) & 1 ? 0.5 : -0.5) * (Math.random() > 0.25 ? 1 : 0.3) + noise, 2];
        case 'incoming': // a call waiting: the carrier hums
          return [Math.sin(i * 0.7) * 0.18 + noise, 1];
        case 'tied':
          return [noise * 0.5, 3];
        default:
          return [noise, 0];
      }
    };
    const fill = () => {
      const n = Math.max(2, Math.ceil(w / STEP) + 1);
      vals = [];
      inks = [];
      for (let k = 0; k < n; k++) {
        const [v, c] = sample();
        vals.push(v);
        inks.push(c);
      }
    };
    const draw = () => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mid = h / 2;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      // One path per run of a colour.
      for (let k = 1; k < vals.length; k++) {
        const c = inks[k];
        ctx.globalAlpha = c === 0 ? 0.55 : c === 3 ? 0.5 : 1;
        ctx.strokeStyle = INKS[c];
        ctx.beginPath();
        ctx.moveTo((k - 1) * STEP, mid - vals[k - 1] * (mid - 2));
        while (k < vals.length && inks[k] === c) {
          ctx.lineTo(k * STEP, mid - vals[k] * (mid - 2));
          k++;
        }
        k--;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grew = Math.ceil(r.width / STEP) + 1 !== vals.length;
      w = r.width;
      h = r.height;
      if (grew) fill();
      draw();
    };

    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let onScreen = true;
    let raf = 0;
    let last = 0;
    const running = () => onScreen && !document.hidden && !still.matches;
    const tick = (now: number) => {
      raf = 0;
      if (!running()) return;
      raf = requestAnimationFrame(tick);
      if (last && now - last < 1000 / FPS) return;
      last = now;
      const [v, c] = sample();
      vals.push(v);
      inks.push(c);
      vals.shift();
      inks.shift();
      draw();
    };
    const update = () => {
      if (running()) {
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    // Still: the state's trace drawn once, afresh when it changes.
    redraw.current = () => { if (still.matches) { burst.current = null; fill(); draw(); } };

    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const view = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); });
    view.observe(canvas);
    document.addEventListener('visibilitychange', update);
    still.addEventListener('change', update);
    resize();
    update();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      sizes.disconnect();
      view.disconnect();
      document.removeEventListener('visibilitychange', update);
      still.removeEventListener('change', update);
      redraw.current = null;
    };
  }, []);

  return (
    <div className="c-scope">
      <canvas ref={ref} className="c-trace" data-testid="comms-trace" aria-hidden />
    </div>
  );
}

// The SATCOM backpack in outline, still (ILI-1246): shown until the Three.js one loads, or without WebGL.
function TerminalMark() {
  return (
    <svg className="c-mark" viewBox="0 0 100 70" aria-hidden>
      <rect x="36" y="30" width="28" height="38" />
      <rect x="35" y="27" width="30" height="4" />
      <rect x="40" y="46" width="20" height="18" />
      <line x1="40" y1="51" x2="60" y2="51" />
      <line x1="40" y1="56" x2="60" y2="56" />
      <rect x="32" y="42" width="4" height="18" />
      <rect x="64" y="42" width="4" height="18" />
      <path d="M36 27 L39 8 L61 8 L64 27" />
      <line x1="46" y1="9" x2="45" y2="26" />
      <line x1="54" y1="9" x2="55" y2="26" />
      <line x1="38" y1="17" x2="62" y2="17" />
      <line x1="33" y1="43" x2="27" y2="4" />
      <path d="M68 46 Q73 50 69 54 Q73 58 70 62" />
      <rect x="68" y="62" width="4" height="7" />
    </svg>
  );
}
