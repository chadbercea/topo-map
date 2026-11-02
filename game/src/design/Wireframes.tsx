import { useEffect, useRef, useState, type ReactNode } from 'react';
import { WireAvatar } from '../hud/OrionAvatar';
import { Section } from './DesignSystem';

// 3D wireframes (ILI-1329): every Three.js scene in the game, live, in the HUD's line language.
// Each loads as it scrolls into view, and steps through its states.
type Load = () => Promise<{ mount: (...a: never[]) => unknown }>;
const SCENES: { name: string; where: string; load: Load; states: string[] }[] = [
  { name: 'ORION-3', where: 'ORION-3’s panel', load: () => import('../hud/orionScene'), states: ['idle', 'slewing', 'tied'] },
  { name: 'SATCOM backpack', where: 'ALPHA’s box and flag, when it needs HQ', load: () => import('../hud/terminalScene'), states: ['idle', 'incoming', 'sending', 'tied'] },
  { name: 'Lensatic compass', where: 'ALPHA’s box, on the move', load: () => import('../hud/mapScene'), states: ['on'] },
  { name: 'M4', where: 'ALPHA’s box, in a fight', load: () => import('../hud/m4Scene'), states: ['on'] },
  { name: 'IFAK', where: 'ALPHA’s box, treating wounded', load: () => import('../hud/ifakScene'), states: ['on'] },
  { name: 'REAPER-1', where: 'The drone strike’s panel', load: () => import('../hud/droneScene'), states: ['inbound', 'strike', 'done'] },
  { name: 'HAMMER-2', where: 'The heli gun run’s panel', load: () => import('../hud/heliScene'), states: ['inbound', 'strike', 'done'] },
  { name: 'RAVEN-6', where: 'The exfil panel', load: () => import('../hud/transportScene'), states: ['enroute', 'down', 'done'] },
  { name: 'OVERWATCH’s rifle', where: 'The sniper’s panel', load: () => import('../hud/rifleScene'), states: ['aiming', 'firing', 'done'] },
];

// Only once it's on screen: a page of live WebGL scenes all at once is heavy.
function Visible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      {seen ? children : <div className="ds-wire" />}
    </div>
  );
}

function Scene({ name, where, load, states }: (typeof SCENES)[number]) {
  const [i, setI] = useState(0);
  return (
    <figure className="ds-spec">
      <div className="ds-stage">
        <Visible>
          <WireAvatar state={states[i]} fallback={<span className="ds-dim">…</span>} load={load as never} className="ds-wire" />
        </Visible>
        {states.length > 1 && (
          <div className="ds-states">
            {states.map((s, j) => (
              <button key={s} aria-pressed={i === j} onClick={() => setI(j)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <figcaption>
        <b>{name}</b>
        <span>{where}</span>
      </figcaption>
    </figure>
  );
}

// Castle House's title scene: the rook, the globe and its satellites, ORION-3 in orange.
function Castle() {
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    import('../hud/castleScene').then(({ mountCastle }) => {
      if (dead || !back.current || !front.current) return;
      stop = mountCastle(back.current, front.current, () => {}, false)?.stop;
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, []);
  return (
    <div className="ds-castle-scene">
      <div ref={back} className="castle-scene" />
      <div ref={front} className="castle-scene" />
    </div>
  );
}

export function Wireframes() {
  return (
    <Section id="wireframes" title="3D wireframes" intro="Every object in the game is an edges-only Three.js model in the HUD's teal (orange for ORION-3 on the title and for ALPHA's backpack when it needs HQ), turning slowly. A state changes its colour and speed, never the model.">
      <figure className="ds-spec" data-wide>
        <div className="ds-stage">
          <Visible>
            <Castle />
          </Visible>
        </div>
        <figcaption>
          <b>Castle House: the rook, the globe, the constellation</b>
          <span>The title screen and the ORION-3 close-up (castleScene). ORION-3 in orange; the others dim, Coming Soon.</span>
        </figcaption>
      </figure>
      <div className="ds-grid ds-wires">
        {SCENES.map((s) => (
          <Scene key={s.name} {...s} />
        ))}
      </div>
    </Section>
  );
}
