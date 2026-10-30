import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, waitingCalls, type Message } from '../sim/comms';
import { blocked } from '../sim/responses';
import { bus, EV, getAskHidden, getMapRect, toScreen } from '../game/events';
import { obstacles, overlap, pick } from './overlays';

const WIDTH = 260;

// ALPHA's ask (ILI-1199, ILI-1200): when the team needs something, an orange flag with its SATCOM
// backpack (ILI-1255) goes up at the top right of its marker on the map, where ALPHA was when it asked (top left
// when there's no room on the right), and a ping pulses from the marker. Click the flag and it
// opens into the ask with the replies as buttons. It holds still as the camera moves; if the
// marker is out of view it waits at the foot of the open map. Several waiting asks page
// "1 of N". It never covers a mini game: it waits while one runs. The whole exchange is logged
// in comms. TEAM's call box (CallBox) slides out with it, the same backpack in the same orange.
export function AskWindow() {
  const comms = useGame((s) => s.comms);
  const pos = useGame((s) => s.team.position);
  const callsign = useGame((s) => s.team.callsign);
  const playing = useGame((s) => s.minigame?.status === 'active');
  const [focus, setFocus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // the ask HQ opened; a new one arrives as a flag
  // Pinned where ALPHA was when it asked, so the window holds still while you answer even if
  // the team keeps walking (a resupply ask doesn't stop it).
  const anchors = useRef(new Map<string, { x: number; y: number }>());
  // Once open, the window holds still on screen too (ILI-1227): the camera follows ALPHA now,
  // and a window sliding with the map is one you can't click. It lets go when it closes.
  const held = useRef<{ id: string; at: ReturnType<typeof place> } | null>(null);
  const [, redraw] = useState(0);
  const flagRef = useRef<HTMLElement>(null);
  const size = useRef({ w: 110, h: 34 }); // the flag's (or open window's) size, as last drawn
  // The flag may end up under a floating panel when nowhere is clear (or wait out a mini game); say so, and the intel
  // stream raises ALPHA's ask where it can't be missed.
  const check = useRef(() => {});
  check.current = () => {
    const flag = flagRef.current?.getBoundingClientRect();
    // Its real size, for placing it next time it draws (no redraw here: near an edge a fixed
    // box shrinks to fit, and re-placing it on every size change would loop).
    if (flag) size.current = { w: Math.round(flag.width), h: Math.round(flag.height) };
    // Anything floating over it: the card, its actions, the status widget, the band (ILI-1215).
    const box = flag && { x: flag.x, y: flag.y, w: flag.width, h: flag.height };
    const covered = !!box && obstacles(['flag']).some((o) => overlap(box, o) > 0);
    const c = game.get().comms;
    const hidden = !!waitingCalls(c).length && (!flag || (covered && openId !== currentCall(c)?.id));
    if (hidden !== getAskHidden()) bus.emit(EV.askHidden, hidden);
  };
  useLayoutEffect(() => check.current());
  // The flag rides the camera and the card settles after the state that opened it: check
  // again a frame after either moves, once the page has laid out.
  useEffect(() => {
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => check.current());
    };
    for (const e of [EV.overlays, EV.camera, EV.mapRect]) bus.on(e, again);
    // And a few times a second regardless: panels settle and reflow in ways no event reports,
    // and a buried call must surface. It's a handful of rect reads.
    const every = setInterval(() => check.current(), 300);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(every);
      for (const e of [EV.overlays, EV.camera, EV.mapRect]) bus.off(e, again);
    };
  }, []);
  useEffect(() => {
    const open = () => {
      const call = currentCall(game.get().comms);
      if (call) setOpenId(call.id);
    };
    bus.on(EV.openAsk, open);
    return () => void bus.off(EV.openAsk, open);
  }, []);
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
  // HQ's answer on its way up the link (ILI-1209): where the flag was, a tag says it's going out
  // until ALPHA reads it back.
  const out = comms.inFlight.at(-1);
  const sent = out && comms.messages.find((m) => m.id === out.id);
  if (!call && sent && !playing) {
    const where = place(anchors.current.get(sent.id) ?? pos, size.current);
    const label = out.responseId ? sent.responses?.find((r) => r.id === out.responseId)?.label : 'Copy';
    return (
      <p className="ask sent" data-testid="sent" data-overlay="flag" data-pinned={where.inView} style={where.style && { ...where.style, width: undefined }} role="status">
        <Backpack /> {label} · sending to {sent.from}
      </p>
    );
  }
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
  if (!open || held.current?.id !== call.id) held.current = null;
  const where = held.current?.at ?? place(anchor, size.current);
  if (open && !held.current && where.inView) held.current = { id: call.id, at: where };
  const { p, inView, side, below, style } = where;

  return (
    <>
      {inView && !open && <span className="ping" style={{ left: p!.x, top: p!.y }} aria-hidden />}
      <section
        ref={flagRef}
        className="ask comms"
        data-testid="comms"
        data-overlay="flag"
        data-open={open}
        data-pinned={inView}
        data-side={side}
        data-below={below}
        style={open ? style : style && { ...style, width: undefined }}
        role={open ? 'dialog' : 'status'}
        aria-label={`${call.from} needs a decision`}
      >
        {!open ? (
          <button className="flag" data-testid="incoming" onClick={() => setOpenId(call.id)} aria-label={`Incoming from ${who}`}>
            <Backpack /> {who}
            {calls.length > 1 && <span className="n">{calls.length}</span>}
          </button>
        ) : (
          <>
            <header className="incoming">
              <Backpack /> {who}
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
            <Replies call={call} testId="responses" />
          </>
        )}
      </section>
    </>
  );
}

// Beside the marker, inside the open map, clear of the other floating panels (ILI-1215): top
// right, top left, bottom right, bottom left, the first that's clear; else the least covered.
// Off the open map, it waits at the open map's foot. size: the flag's or window's size.
function place(anchor: { x: number; y: number }, size: { w: number; h: number }) {
  const area = getMapRect();
  const raw = toScreen(anchor.x, anchor.y);
  const p = raw && { x: Math.round(raw.x), y: Math.round(raw.y) };
  const inView = !!p && !!area && p.x >= area.x && p.x <= area.x + area.width && p.y >= area.y && p.y <= area.y + area.height;
  const w = Math.min(WIDTH, innerWidth - 32);
  if (!inView || !area) return { p, inView: false, side: 'right', below: false, style: area ? { left: area.x + 8, top: area.y + area.height - 8, width: w } : undefined };
  const { x, y } = p!;
  const { w: fw, h: fh } = size;
  const spots = [
    { x: x + 14, y: y - 14 - fh, side: 'right', below: false },
    { x: x - 14 - fw, y: y - 14 - fh, side: 'left', below: false },
    { x: x + 14, y: y + 14, side: 'right', below: true },
    { x: x - 14 - fw, y: y + 14, side: 'left', below: true },
  ]
    .map((c) => ({ ...c, w: fw, h: fh }))
    .filter((c) => c.x >= area.x + 4 && c.x + c.w <= area.x + area.width - 4 && c.y >= area.y + 4 && c.y + c.h <= area.y + area.height - 4);
  const at = spots.length ? pick(spots, obstacles(['flag'])) : { x: Math.max(area.x + 4, x - fw / 2), y: area.y + 4, w: fw, h: fh, side: 'right', below: true };
  // The window hangs from its top-left (styles: translateY(-100%), so top is its foot).
  return { p, inView, side: at.side, below: at.below, style: { left: Math.round(at.x), top: Math.round(at.y + at.h), width: w } };
}

// HQ's answers to a call, as buttons: each reply, greyed with the reason when HQ can't afford
// it or lacks the kit, or a plain Copy. At ALPHA's flag: COMMS is a list only (ILI-1255).
export function Replies({ call, testId }: { call: Message; testId: string }) {
  const state = useGame((s) => s);
  return (
    <div className="actions" data-testid={testId}>
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
  );
}

// ALPHA's SATCOM backpack (ILI-1255), the one in 3D in TEAM's call box: the pack, its lid,
// the radio pocket, and the whip antenna.
export const Backpack = () => (
  <svg className="pack" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="8" height="10" rx="1" />
      <path d="M3.5 7.5h8M5.5 10h4v3h-4zM6 5V3.5h3V5M10.5 5 13 1" />
    </g>
  </svg>
);
