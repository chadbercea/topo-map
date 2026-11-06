import { useEffect, useLayoutEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { CAPTURE, describe, lookSquare, orionSquare, satelliteBusy, satelliteStatus, slewMs, type CaptureMode } from '../sim/satellite';
import { freshness, targets } from '../sim/imagery';
import { nextBlind } from '../sim/progress';
import { CELL, squareAt, squareCenter } from '../map/grid';
import { countdown, gameSpan, zulu } from '../sim/gameTime';
import { bus, EV } from '../game/events';
import { OrionAvatar } from './OrionAvatar';
import { useTier } from './tier';
import { EnvWidget } from './EnvWidget';
import { imageryOk, weather } from '../sim/conditions';

const MODES: CaptureMode[] = ['photo', 'video']; // no burst (ILI-1314)
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

  const result = sat.state === 'idle' ? sat.result : null;
  const picked = lookSquare(s); // the square HQ is working
  const tier = useTier();
  // The fighters in ORION-3's picture: a tap on one opens their square's anchor, with its
  // strikes (ILI-1302).
  const marked = square ? targets(s).filter((t) => squareAt(t.x, t.y) === square) : [];
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
  const inPosition = live || sat.state === 'capturing' || (sat.state === 'idle' && !!picked && away === 0);

  // The priority ladder (ILI-1400): the panel never scrolls. As it gets shorter, what ranks
  // lowest drops first (styles.css, container queries on the panel's own height): 8 the weather
  // tiles, telemetry and Last look; 6 what it saw; 5 the 3D satellite (to its outline, then
  // gone); 4 the name (to an icon); 3 the state line; 2 the picture, which takes what's left
  // down to a floor; 1 the buttons, 60 px, pinned to the bottom, never hidden. The square's
  // details are in its menu on the map now (tier three, tap the square).
  return (
    <section className="panel orion" data-testid="satellite" data-state={sat.state} aria-label="ORION-3 imaging satellite">
      <h2>
        <span className="o-name" title="ORION-3">
          <SatelliteIcon />
          <span className="o-name-text">ORION-3</span>
        </span>
        <span className="o-state" data-testid="orion-state" data-cloud={cloud}>
          {stateLine}
        </span>
      </h2>
      <p className="sr-only" data-testid="satellite-status">
        {tied ? 'ORION-3 · tied up' : satelliteStatus(s)}
      </p>

      {/* ORION-3 itself (ILI-1235): the 3D satellite, its outline when space is short, and its
          telemetry. */}
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

      {/* The AO's weather, three and three (ILI-1249); on a fold or phone it's the slim line. */}
      {tier === 'wide' && <EnvWidget />}

      {/* The image area: the picture takes what's left (ILI-1400). */}
      <div className="o-frame">
        {showPicture ? (
          <div ref={picRef} className="o-picture" data-testid="satellite-inset" data-state={live ? sat.state : 'imaged'} aria-label={`ORION-3's picture of ${square}`}>
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
              {square &&
                marked.map((t, i) => {
                  const o = squareCenter(square)!;
                  return (
                    <button
                      key={i}
                      className="o-target"
                      style={{ left: `${50 + ((t.x - o.x) / CELL) * 100}%`, top: `${50 + ((t.y - o.y) / CELL) * 100}%` }}
                      onClick={() => game.openEvent(`contact-${t.contactId}`)}
                      aria-label={`Strike the fighters in ${square}`}
                      data-testid="target-pin"
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

      {/* ORION-3's buttons (rank 1): 60 px, pinned to the bottom, each lit when it can be used.
          On station, Photo pulses: it's the next thing to do (ILI-1257). */}
      <div className="o-buttons" data-testid="orion-buttons">
        {inPosition && !tied ? (
          <div className="modes" data-testid="capture-modes">
            {MODES.map((m) => (
              <button key={m} disabled={sat.state === 'capturing' || (m === 'video' && s.intel.videoUsed)} onClick={() => game.capture(m)} data-testid={`capture-${m}`} title={CAPTURE[m].what} data-cue={(m === 'photo' && sat.state === 'onStation') || undefined}>
                {CAPTURE[m].label}
                {/* Video is once a session (ILI-1314). */}
                <small>{m === 'video' && s.intel.videoUsed ? 'used' : m === 'video' ? `${gameSpan(CAPTURE[m].ms)} · once` : CAPTURE[m].ms ? gameSpan(CAPTURE[m].ms) : 'instant'}</small>
              </button>
            ))}
          </div>
        ) : (
          <button className="o-reposition" disabled={!picked || tied || sat.state !== 'idle' || satelliteBusy(s)} onClick={() => picked && game.lookAt(picked)} data-testid="look-here" title="Reposition ORION-3 over the picked square">
            {sat.state === 'slewing' && !tied ? `Repositioning to ${sat.aim}` : 'Reposition'}
            <small>{tied ? 'tied up by the intercept' : sat.state === 'slewing' ? 'on its way' : picked ? `to ${picked} · ${countdown(away)}` : 'pick a square'}</small>
          </button>
        )}
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
