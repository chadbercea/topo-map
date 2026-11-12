import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, orionSquare, satelliteBusy, satelliteStatus, satName, slewMs } from '../sim/satellite';
import { freshness } from '../sim/imagery';
import { heldIntel, settled } from '../sim/intel';
import { AIR, airGone, arrived } from '../sim/air';
import { SNIPER_CALLSIGN, sniperGone } from '../sim/sniper';
import { pins, useSeenVersion } from './pins';
import { nextBlind } from '../sim/progress';
import { CELL, squareCenter } from '../map/grid';
import { countdown, gameSpan, zulu } from '../sim/gameTime';
import { bus, EV } from '../game/events';
import { OrionAvatar } from './OrionAvatar';
import { useFold, useTier } from './tier';
import { imageryOk, weather } from '../sim/conditions';

const CLOUD_WARN = 70; // cloud cover where ORION-3 could soon be blind (as EnvWidget's tile)

// ORION-3, the imaging satellite (ILI-1219): the big panel down the right, and everything about
// looking at a square (ILI-1308). A square HQ picks shows here, its details and Reposition;
// Reposition tasks ORION-3 (ILI-1250), and it moves with a countdown that runs down to nothing,
// then, on station, the ways to look (photo, video) take its place; a capture runs its
// time, and what it saw stays in the picture. What HQ can *do* to the square (its strikes, the
// sniper, a signal) is in the square's anchor on the map (ILI-1302). The
// picture has a fixed place at the panel's top (ILI-1229): with no square to show it holds a
// placeholder, where the Three.js satellite goes (ILI-1196). A strike ties it up. Phaser
// draws the picture into the frame.
export function OrionPanel() {
  const s = useGame((x) => x);
  const sat = s.satellite;
  const now = s.elapsedMs;
  const tied = s.minigame?.status === 'active';
  const square = orionSquare(s);
  const snap = square ? s.imagery[square] : undefined;
  const live = sat.state === 'onStation' || sat.state === 'capturing';
  const name = satName(s); // from the mission's config (ILI-1401)

  const result = sat.state === 'idle' ? sat.result : null;
  const picked = lookSquare(s); // the square HQ is working
  const tier = useTier();
  useSeenVersion(); // its targets follow what the map has bracketed (ILI-1444)
  const pings = square ? s.events.filter((e) => e.square === square && e.status !== 'resolved' && e.kind !== 'site') : [];
  // The larger square while ORION-3 is on it, or what it last saw; else the placeholder (ILI-1229).
  const showPicture = !tied && (live || (sat.state === 'idle' && !!square && !!snap));
  const blind = nextBlind(s);
  const caption = tied
    ? 'Tied up by the intercept'
    : sat.state === 'slewing'
      ? `On its way to ${sat.aim}`
      : picked
        ? `No imagery of ${picked} · Reposition`
        : blind
          ? `Standing by over ${sat.aim} · no imagery of ${blind} ahead`
          : `Standing by over ${sat.aim} · tap a square to task it`;
  const last = Object.values(s.imagery)
    .filter((x) => x.mode !== 'eyes')
    .sort((a, b) => b.atMs - a.atMs)[0];

  // The picture frame: Phaser's inset camera draws ORION-3's view of the square into it.
  const picRef = useRef<HTMLDivElement>(null);
  const sent = useRef('');
  useLayoutEffect(() => {
    const r = picRef.current?.getBoundingClientRect();
    // Only while the frame is wholly in the panel's view: Phaser draws over the page, so a frame
    // scrolled part out of the panel would paint over whatever is beside it.
    const view = picRef.current?.closest('.orion')?.getBoundingClientRect();
    const whole = !!r && !!view && r.top >= view.top - 1 && r.bottom <= view.bottom + 1;
    const frame = r && r.width && r.height && whole ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
    const key = JSON.stringify(frame);
    if (key !== sent.current) bus.emit(EV.inset, frame);
    sent.current = key;
  });
  useEffect(() => () => void bus.emit(EV.inset, null), []);
  // On a phone the panel slides up into place (ILI-1461): measure the picture again once it lands.
  const sectionRef = useRef<HTMLElement>(null);
  const [, relayout] = useState(0);
  useEffect(() => {
    const slot = sectionRef.current?.closest('.slot-orion');
    if (!slot) return;
    const on = () => relayout((n) => n + 1);
    slot.addEventListener('animationend', on);
    return () => slot.removeEventListener('animationend', on);
  }, []);

  const avatar = tied ? 'tied' : sat.state === 'slewing' ? 'slewing' : 'idle';
  const status = tied ? 'Tied up' : sat.state === 'idle' ? 'Standby' : sat.state === 'slewing' ? 'Repositioning' : sat.state === 'onStation' ? 'On station' : CAPTURE[sat.mode!].label;
  const left = Math.max(0, sat.arriveMs - now);
  // The one state line (ILI-1400): status, square and the one countdown, in one row. The cloud
  // warning survives as its colour when everything under it has dropped off.
  const clock = sat.state === 'slewing' ? countdown(left) : sat.state === 'capturing' ? gameSpan(sat.captureUntilMs - now) : null;
  const stateLine = tied ? 'Tied up · listening' : `${status} · ${sat.state === 'slewing' ? '→ ' : sat.state === 'idle' ? 'over ' : ''}${sat.aim}${clock ? ` · ${clock}` : ''}`;
  const wx = weather(s);
  const cloud = !imageryOk(wx) ? 'red' : wx.cloudPct >= CLOUD_WARN ? 'amber' : undefined;
  // Reposition, then shoot (ILI-1250): a scan *is* the photo or video, so there's no Scan
  // step. Until ORION-3 is over the square HQ is working, its one button is a big Reposition;
  // once it's there, Photo and Video take its place.
  const away = picked ? slewMs(s, picked) : 0;
  // The three buttons' state, for the square ORION-3 is over (ILI-1432).
  const busy = sat.state === 'capturing';
  const done = settled(s, sat.aim);
  const held = !!heldIntel(s, sat.aim);
  const onVideo = (s.intel.live ?? []).includes(sat.aim);
  const inPosition = live || sat.state === 'capturing' || (sat.state === 'idle' && !!picked && away === 0);
  // Every satellite action lives here, and only here (ILI-1459, ILI-1465): Scan, Photo and Video
  // under the picture, always in their places, lit when they can be used; Reposition in the header.
  const ready = inPosition && !tied;
  // A strike under way on the square ORION-3 is over: its picture goes to targeting (ILI-1467).
  const hit = (() => {
    if (s.sniper && s.sniper.square === sat.aim && !sniperGone(s.sniper, now)) return { who: SNIPER_CALLSIGN, what: 'Sniper', line: s.sniper.done ? 'Done' : 'Firing' };
    for (const w of ['drone', 'heli'] as const) {
      const r = w === 'drone' ? s.drone : s.heli;
      if (r && r.square === sat.aim && !airGone(r, now)) return { who: AIR[w].callsign, what: w === 'drone' ? 'Drone' : 'Heli', line: r.doneMs !== null ? 'Done' : arrived(r, now) ? 'Over target' : `Impact ${countdown(r.arriveMs - now)}` };
    }
    return null;
  })();
  const fold = useFold();
  const wide = tier === 'wide' || fold; // a fold upright lays ORION-3 out like a wide screen, side to side (ILI-1461)
  const canMove = !!picked && !tied && sat.state === 'idle' && !satelliteBusy(s) && away > 0;

  // The priority ladder (ILI-1400): the panel never scrolls. As it gets shorter, what ranks
  // lowest drops first (styles.css, container queries on the panel's own height): 8 the weather
  // tiles, telemetry and Last look; 6 what it saw; 5 the 3D satellite (to its outline, then
  // gone); 4 the name (to an icon); 3 the state line; 2 the picture, which takes what's left
  // down to a floor; 1 the buttons, 60 px, pinned to the bottom, never hidden. The square's
  // details are in its menu on the map now (tier three, tap the square).
  return (
    <section ref={sectionRef} className="panel orion" data-testid="satellite" data-state={sat.state} aria-label={`${name} imaging satellite`}>
      <h2>
        <span className="o-name" title={name}>
          <SatelliteIcon />
          <span className="o-name-text">{name}</span>
        </span>
        <button className="o-repo" disabled={!canMove} onClick={() => picked && game.lookAt(picked)} data-testid="look-here" title={`Reposition ${name} over the picked square`}>
          {sat.state === 'slewing' && !tied ? 'Moving' : '⇄ Reposition'}
          {canMove && <small> to {picked} · {countdown(away)}</small>}
        </button>
        <span className="o-state" data-testid="orion-state" data-cloud={cloud}>
          {stateLine}
        </span>
      </h2>
      <p className="sr-only" data-testid="satellite-status">
        {tied ? `${name} · tied up` : satelliteStatus(s)}
      </p>

      {/* ORION-3 itself (ILI-1235): the 3D satellite, its outline when space is short, and its
          telemetry. */}
      {!wide && tier !== 'compact' && ( // a glyph in the header names it on a phone too (ILI-1461)
      <div className="o-satpanel" data-testid="orion-avatar" data-state={avatar}>
        <OrionAvatar state={avatar} fallback={<SatelliteMark />} />
        <span className="o-mark" aria-hidden>
          <SatelliteMark />
        </span>
        <dl className="o-telemetry">
          <div>
            <dt>Status</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>{sat.state === 'slewing' ? 'Heading' : 'Over'}</dt>
            <dd>{sat.aim}</dd>
          </div>
        </dl>
      </div>
      )}

      {/* The AO's weather, three and three (ILI-1249); on a fold or phone it's the slim line. */}

      {/* The image area: the picture takes what's left (ILI-1400). */}
      <div className="o-frame">
        {/* The square's details, under its picture (ILI-1438): its intel, ALPHA's work there, its
            ground. Only for the square ORION-3 is over and locked on. */}
        {showPicture ? (
          <div ref={picRef} className="o-picture" data-testid="satellite-inset" data-state={live ? sat.state : 'imaged'} data-targeting={hit ? 'true' : undefined} aria-label={`${name}'s picture of ${square}`}>
            {hit && (
              <div className="o-targeting" data-testid="targeting" aria-live="polite">
                <i className="o-reticle" aria-hidden />
                <span className="o-tt">
                  Targeting · {hit.what} · {hit.who}
                </span>
                <span className="o-tc" data-testid="targeting-line">
                  {hit.line}
                </span>
              </div>
            )}
            {/* The fighters it shows, each a tap away from its strikes (ILI-1250). Phaser draws the
                dots; these sit on them, in the square's width at the picture's middle. */}
            <div className="o-targets">
              {/* The square's pings, named on hover like on the map (ILI-1297). The marker sits a
                  quarter in from the square's top right (MapScene.markerPos). */}
              {pings.map((e) => (
                <button key={e.id} className="o-ping" data-kind={e.kind} style={{ left: '75%', top: '25%' }} onClick={() => game.openEvent(e.id)} data-testid="orion-ping">
                  <span>
                    {e.square} · {e.title}
                  </span>
                </button>
              ))}
              {/* Everything bracketed in the square, hoverable and pinnable right here (ILI-1444):
                  ORION-3's picture is where the detail lives. */}
              {square &&
                pins
                  .seen()
                  .filter((t) => t.kind !== 'team' && t.kind !== 'event' && t.kind !== 'signal' && t.square === square)
                  .map((t) => {
                    const o = squareCenter(square)!;
                    return (
                      <button
                        key={t.id}
                        className={t.kind === 'hostile' ? 'o-target' : 'o-thing'}
                        style={{ left: `${50 + ((t.x - o.x) / CELL) * 100}%`, top: `${50 + ((t.y - o.y) / CELL) * 100}%` }}
                        onPointerEnter={() => pins.hover(t.id, 'orion')}
                        onPointerLeave={() => pins.get().hovered === t.id && pins.hover(null, 'orion')}
                        onClick={() => pins.toggle(t.id)}
                        aria-label={t.kind === 'hostile' ? `Hostile in ${square}` : `${t.kind} in ${square}`}
                        data-testid={t.kind === 'hostile' ? 'target-pin' : `pic-${t.id}`}
                      />
                    );
                  })}
            </div>
          </div>
        ) : (
          <div className="o-placeholder" data-testid="orion-placeholder" data-state={tied ? 'tied' : sat.state}>
            <span className="o-caption">{!tied && sat.state === 'slewing' ? `On its way to ${sat.aim}, then take the photo` : caption}</span>
          </div>
        )}
      </div>

      {/* What it saw, one line (rank 6). */}
      {!tied && result && (
        <p className="o-saw" data-testid="satellite-result">
          Saw {result.square} · {CAPTURE[result.mode].label}: {describe(result)}
        </p>
      )}
      {/* The one Last look (rank 8). */}
      <p className="o-last">Last look {last ? `${last.square} · ${last.mode} ${zulu(last.atMs)} · ${freshness(last, now)}` : 'none yet'}</p>

      {/* ORION-3's buttons (rank 1), pinned under the picture, never hidden: Scan across the width,
          then Photo and Video. Each is lit when it can be used, and the next thing to do pulses
          (ILI-1257, ILI-1432). Scan settles the square; Photo sends its intel to ALPHA to keep it
          moving; Video keeps the square live on the map for good. */}
      <div className="o-buttons" data-testid="orion-buttons">
        <div className="modes" data-testid="capture-modes" data-step={done ? 'send' : 'scan'}>
          <button className="o-scan" disabled={!ready || busy || done} onClick={() => game.scan(sat.aim)} data-testid="capture-scan" title="Settle the square: its intel lands on it" data-cue={(ready && !busy && !done) || undefined}>
            Scan {sat.aim}
            <small>{tied ? 'tied up by the intercept' : done ? 'settled' : ready ? 'settles the square' : sat.state === 'slewing' ? 'on its way' : 'lock on first'}</small>
          </button>
          <button disabled={!ready || busy || !done || !held} onClick={() => game.photo(sat.aim)} data-testid="capture-photo" title={`Send ${sat.aim}'s intel to ${s.team.callsign}`} data-cue={(ready && done && held && !busy) || undefined}>
            Photo
            <small>{!done ? 'after a scan' : held ? `send to ${s.team.callsign}` : `sent to ${s.team.callsign}`}</small>
          </button>
          <button disabled={!ready || busy || !done || onVideo} onClick={() => game.capture('video')} data-testid="capture-video" title="Keep the square live on the map for good">
            Video
            <small>{onVideo ? 'live' : busy ? 'filming' : !done ? 'after a scan' : 'live for good'}</small>
          </button>
        </div>
      </div>
    </section>
  );
}

// The name at its tightest (ILI-1400): the satellite as an icon, its name on hover and long press.
function SatelliteIcon() {
  return (
    <svg className="o-icon" viewBox="0 0 16 16" aria-hidden>
      <rect x="1" y="6" width="4" height="4" />
      <rect x="6" y="5" width="4" height="6" />
      <rect x="11" y="6" width="4" height="4" />
    </svg>
  );
}

// ORION-3 in outline, still: shown until the Three.js satellite loads, or without WebGL (ILI-1196).
function SatelliteMark() {
  return (
    <svg className="o-sat" viewBox="0 0 120 60" aria-hidden>
      <rect x="4" y="22" width="34" height="16" />
      <line x1="15" y1="22" x2="15" y2="38" />
      <line x1="26" y1="22" x2="26" y2="38" />
      <line x1="38" y1="30" x2="48" y2="30" />
      <rect x="48" y="20" width="24" height="20" />
      <line x1="72" y1="30" x2="82" y2="30" />
      <rect x="82" y="22" width="34" height="16" />
      <line x1="94" y1="22" x2="94" y2="38" />
      <line x1="105" y1="22" x2="105" y2="38" />
      <path d="M54 40 L60 50 L66 40" />
    </svg>
  );
}
