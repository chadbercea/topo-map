import { useEffect, useState } from 'react';

// ORION-3's feed down the right of the close-up (ILI-1292): the bird's telemetry ticking over,
// the X-band link, its ground track and the station log scrolling by, the way an ops floor
// shows a satellite it's about to take. Flavour only: nothing here is the mission.

const LOG = [
  'TLE EPOCH UPDATED',
  'GND STN KESTREL · AOS',
  'X-BAND CARRIER LOCK',
  'TT&C LINK NOMINAL',
  'CRYPTO KEY {hex} VALID',
  'BUS VOLTAGE 28.1 V',
  'STAR TRACKER · ATTITUDE HOLD',
  'EO/IR PAYLOAD · STANDBY',
  'REACTION WHEELS NOMINAL',
  'DOWNLINK BUFFER CLEAR',
  'EPHEMERIS CHECKSUM {hex}',
  'SATCOM RELAY-7 IN VIEW',
  'TASKING QUEUE · EMPTY',
  'AWAITING OPERATOR AUTH',
];
const hex = () => Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
const stamp = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
const line = (i: number) => ({ id: i, at: stamp(new Date()), text: LOG[i % LOG.length].replace('{hex}', `${hex()}-${hex()}`) });

// A lap is about 95 minutes; the readout runs it quick so it's seen to move.
const ORBIT_S = 240;

export function OrionFeed() {
  const still = navigator.webdriver === true;
  const [t, setT] = useState(0);
  const [log, setLog] = useState(() => Array.from({ length: 6 }, (_, i) => line(i)));
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const tick = setInterval(() => setT((performance.now() - start) / 1000), 120);
    let n = 6;
    const feed = setInterval(() => setLog((l) => [...l.slice(-7), line(n++)]), 650);
    return () => (clearInterval(tick), clearInterval(feed));
  }, [still]);

  const ph = ((t / ORBIT_S) * Math.PI * 2 + 1.1) % (Math.PI * 2);
  const lat = Math.asin(Math.sin(ph) * Math.sin((82.6 * Math.PI) / 180)) * (180 / Math.PI); // a 97.4° orbit tops out at 82.6°
  const lon = ((((ph * 180) / Math.PI - t * 0.25 + 40) % 360) + 540) % 360 - 180;
  const jitter = (a: number, b: number) => a + Math.sin(t * b) * a * 0.0004;
  const ll = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? pos : neg}`;
  // The ground track: one lap of latitude against longitude, and where the bird is on it.
  const track = Array.from({ length: 61 }, (_, i) => {
    const p = (i / 60) * Math.PI * 2;
    return `${(i / 60) * 200},${30 - Math.sin(p) * 24}`;
  }).join(' ');
  const dot = { x: (ph / (Math.PI * 2)) * 200, y: 30 - Math.sin(ph) * 24 };

  return (
    <aside className="panel orion-feed" data-testid="orion-feed" aria-hidden>
      <header>
        <b>ORION-3</b>
        <span>ISR · NORAD 58417</span>
      </header>
      <dl>
        <dt>ALT</dt>
        <dd>{jitter(512.4, 0.7).toFixed(1)} km</dd>
        <dt>VEL</dt>
        <dd>{jitter(7.612, 1.3).toFixed(3)} km/s</dd>
        <dt>INC</dt>
        <dd>97.40°</dd>
        <dt>LAT</dt>
        <dd>{ll(lat, 'N', 'S')}</dd>
        <dt>LON</dt>
        <dd>{ll(lon, 'E', 'W')}</dd>
      </dl>
      <svg className="track" viewBox="0 0 200 60" preserveAspectRatio="none">
        <line x1="0" y1="30" x2="200" y2="30" />
        <polyline points={track} />
        <circle cx={dot.x} cy={dot.y} r="2.5" />
      </svg>
      <div className="link">
        <span>X-BAND</span>
        <i className="spectrum">
          {Array.from({ length: 18 }, (_, i) => (
            <s key={i} style={{ '--d': `${(i * 137) % 900}ms` } as React.CSSProperties} />
          ))}
        </i>
        <span className="ready">UPLINK READY</span>
      </div>
      <ol className="log">
        {log.map((l) => (
          <li key={l.id}>
            <span>{l.at}</span> {l.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
