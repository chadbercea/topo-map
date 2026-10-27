import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, waitingCalls } from '../sim/comms';
import { blocked } from '../sim/responses';
import { bus, EV, getMapRect, toScreen } from '../game/events';

const WIDTH = 260;

// ALPHA's ask (ILI-1199, ILI-1200): when the team needs something, an orange flag with a dish
// goes up at the top right of its marker on the map, where ALPHA was when it asked (top left
// when there's no room on the right), and a ping pulses from the marker. Click the flag and it
// opens into the ask with the replies as buttons. It holds still as the camera moves; if the
// marker is out of view it waits at the foot of the open map. Several waiting asks page
// "1 of N". It never covers a mini game: it waits while one runs. The whole exchange is logged
// in comms.
export function AskWindow() {
  const comms = useGame((s) => s.comms);
  const pos = useGame((s) => s.team.position);
  const callsign = useGame((s) => s.team.callsign);
  const playing = useGame((s) => s.minigame?.status === 'active');
  const state = useGame((s) => s);
  const [focus, setFocus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // the ask HQ opened; a new one arrives as a flag
  // Pinned where ALPHA was when it asked, so the window holds still while you answer even if
  // the team keeps walking (a resupply ask doesn't stop it).
  const anchors = useRef(new Map<string, { x: number; y: number }>());
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

  const calls = waitingCalls(comms);
  const call = calls.find((m) => m.id === focus) ?? currentCall(comms);
  if (!call || playing) return null;
  const at = calls.indexOf(call);
  if (!anchors.current.has(call.id)) anchors.current.set(call.id, { x: Math.round(pos.x), y: Math.round(pos.y) });
  const anchor = anchors.current.get(call.id)!;
  const open = openId === call.id;
  const page = (d: number) => {
    const next = calls[(at + d + calls.length) % calls.length].id;
    setFocus(next);
    setOpenId(next);
  };
  const who = call.from === callsign ? callsign : call.from;

  // Top right of the marker, inside the open map; else the open map's foot.
  const area = getMapRect();
  const raw = toScreen(anchor.x, anchor.y);
  const p = raw && { x: Math.round(raw.x), y: Math.round(raw.y) };
  const inView = !!p && !!area && p.x >= area.x && p.x <= area.x + area.width - 40 && p.y >= area.y + 40 && p.y <= area.y + area.height;
  const w = Math.min(WIDTH, innerWidth - 32);
  const right = inView && p!.x + 14 + w <= area!.x + area!.width; // room on the marker's right?
  const side = right ? 'right' : 'left';
  const style = inView
    ? right
      ? { left: p!.x + 14, top: Math.max(p!.y - 14, area!.y + 120), width: w }
      : { right: innerWidth - Math.max(area!.x + w, p!.x - 14), top: Math.max(p!.y - 14, area!.y + 120), width: w } // flag and window both end at the marker
    : area
      ? { left: area.x + 8, top: area.y + area.height - 8, width: w }
      : undefined;

  return (
    <>
      {inView && !open && <span className="ping" style={{ left: p!.x, top: p!.y }} aria-hidden />}
      <section
        className="ask comms"
        data-testid="comms"
        data-open={open}
        data-pinned={inView}
        data-side={side}
        style={open ? style : style && { ...style, width: undefined }}
        role={open ? 'dialog' : 'status'}
        aria-label={`${call.from} needs a decision`}
      >
        {!open ? (
          <button className="flag" data-testid="incoming" onClick={() => setOpenId(call.id)} aria-label={`Incoming from ${who}`}>
            <Dish /> {who}
            {calls.length > 1 && <span className="n">{calls.length}</span>}
          </button>
        ) : (
          <>
            <header className="incoming">
              <Dish /> {who}
              {calls.length > 1 && (
                <span className="pager">
                  <button onClick={() => page(-1)} aria-label="Previous call">
                    ‹
                  </button>
                  {at + 1} of {calls.length}
                  <button onClick={() => page(1)} aria-label="Next call" data-testid="more-calls">
                    ›
                  </button>
                </span>
              )}
              <button className="hide" onClick={() => setOpenId(null)} aria-label="Hide">
                –
              </button>
            </header>
            <p className="text" data-testid="comms-text">
              {call.text}
            </p>
            <div className="actions" data-testid="responses">
              {call.responses ? (
                call.responses.map((r) => {
                  const why = blocked(state, r);
                  return (
                    <button key={r.id} disabled={!!why} onClick={() => game.respond(call.id, r.id)} title={why ?? undefined}>
                      {r.label}
                      {why && <small> ({why})</small>}
                    </button>
                  );
                })
              ) : (
                <button onClick={() => game.confirmCall(call.id)}>{call.holds ? 'Copy, proceed' : 'Copy'}</button>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}

// A satellite dish: the bowl, its feed, the stand, and the signal coming in.
const Dish = () => (
  <svg className="dish" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 5a7 7 0 0 0 8.5 8.5z" />
      <path d="M6.75 9.25 10 6" />
      <path d="M5.5 12.5 4 15h4.5" />
      <path d="M11 1.5a3.5 3.5 0 0 1 3.5 3.5M11 4a1 1 0 0 1 1 1" />
    </g>
  </svg>
);
