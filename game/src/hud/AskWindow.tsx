import { useEffect, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, waitingCalls } from '../sim/comms';
import { blocked } from '../sim/responses';
import { bus, EV, getMapRect, toScreen } from '../game/events';

const WIDTH = 260;

// ALPHA's ask (ILI-1199): when the team needs something, a small window pins to the top right
// of its marker on the map (top left when there's no room on the right) with the ask and tiny
// text replies. It follows the marker as the
// team and the camera move; if the marker is out of view it waits at the foot of the open
// map. Several waiting asks page "1 of N". It never covers a mini game: it waits while one
// runs. The whole exchange is logged in comms.
export function AskWindow() {
  const comms = useGame((s) => s.comms);
  const pos = useGame((s) => s.team.position);
  const callsign = useGame((s) => s.team.callsign);
  const playing = useGame((s) => s.minigame?.status === 'active');
  const state = useGame((s) => s);
  const [focus, setFocus] = useState<string | null>(null);
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
  const page = (d: number) => setFocus(calls[(at + d + calls.length) % calls.length].id);

  // Top right of the marker, inside the open map; else the open map's foot.
  const area = getMapRect();
  const p = toScreen(pos.x, pos.y);
  const inView = !!p && !!area && p.x >= area.x && p.x <= area.x + area.width - 40 && p.y >= area.y + 40 && p.y <= area.y + area.height;
  const w = Math.min(WIDTH, innerWidth - 32);
  const right = inView && p!.x + 14 + w <= area!.x + area!.width; // room on the marker's right?
  const side = right ? 'right' : 'left';
  const style = inView
    ? { left: right ? p!.x + 14 : Math.max(area!.x, p!.x - 14 - w), top: Math.max(p!.y - 14, area!.y + 120), width: w }
    : area
      ? { left: area.x + 8, top: area.y + area.height - 8, width: w }
      : undefined;

  return (
    <section className="ask comms" data-testid="comms" data-pinned={inView} data-side={side} style={style} role="dialog" aria-label={`${call.from} needs a decision`}>
      <header className="incoming">
        <span className="dot" aria-hidden /> {call.from === callsign ? callsign : call.from}
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
    </section>
  );
}
