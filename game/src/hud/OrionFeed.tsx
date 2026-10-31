import { useEffect, useRef, useState } from 'react';

// The ORION-3 close-up's ops-floor screens (ILI-1292, ILI-1295), the way a film shows a
// satellite it's about to take. Down the right, ORION-3's rack: its payload's dials over the
// telemetry feed over power and link meters, the outer two hanging off the screen's edges. Down
// the left, the rest of the constellation's feeds, dead: static and no carrier. Flavour only:
// nothing here is the mission. Static under test automation.

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

const still = typeof navigator !== 'undefined' && navigator.webdriver === true;

// Seconds since the screens came up, ticking every 120 ms.
function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const tick = setInterval(() => setT((performance.now() - start) / 1000), 120);
    return () => clearInterval(tick);
  }, []);
  return t;
}

// A value that wanders about `mid`, by up to `span`, at its own pace.
const wander = (t: number, mid: number, span: number, rate: number, seed = 0) => mid + span * (0.6 * Math.sin(t * rate + seed) + 0.4 * Math.sin(t * rate * 2.7 + seed * 3));

// ORION-3's rack, down the right.
export function OrionRack() {
  const t = useClock();
  return (
    <div className="feed-rack" data-depth="near" aria-hidden>
      <Payload t={t} />
      <OrionFeed t={t} />
      <Power t={t} />
    </div>
  );
}

// A round dial: the scale as an arc, the reading as a brighter arc and a needle.
function Dial({ label, value, min, max, unit, warn }: { label: string; value: number; min: number; max: number; unit: string; warn?: boolean }) {
  const k = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const at = (k: number, r: number) => [32 + Math.cos(a0 + sweep * k) * r, 32 + Math.sin(a0 + sweep * k) * r];
  const arc = (k: number) => {
    const [x0, y0] = at(0, 24);
    const [x1, y1] = at(k, 24);
    return `M${x0} ${y0} A24 24 0 ${sweep * k > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const [nx, ny] = at(k, 18);
  return (
    <figure className="dial" data-warn={warn || undefined}>
      <svg viewBox="0 0 64 64">
        <path className="scale" d={arc(1)} />
        <path className="value" d={arc(k)} />
        {Array.from({ length: 11 }, (_, i) => {
          const [x0, y0] = at(i / 10, 27);
          const [x1, y1] = at(i / 10, i % 5 ? 29 : 31);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />;
        })}
        <line className="needle" x1="32" y1="32" x2={nx} y2={ny} />
        <circle cx="32" cy="32" r="2" />
        <text x="32" y="50">
          {value.toFixed(1)}
          {unit}
        </text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

// The payload: where the camera's pointed, and how it's doing.
function Payload({ t }: { t: number }) {
  return (
    <section className="panel feed-panel payload">
      <header>
        <b>EO/IR PAYLOAD</b>
        <span>GSD 0.31 m · STBY</span>
      </header>
      <div className="dials">
        <Dial label="GIMBAL AZ" value={wander(t, 184, 40, 0.21)} min={0} max={360} unit="°" />
        <Dial label="GIMBAL EL" value={wander(t, -38, 9, 0.17, 1)} min={-90} max={0} unit="°" />
        <Dial label="FOCAL" value={wander(t, 620, 80, 0.09, 2)} min={200} max={1200} unit="" />
        <Dial label="FPA TEMP" value={wander(t, 81.5, 1.2, 0.31, 3)} min={60} max={100} unit="K" />
      </div>
      <dl className="mini">
        <dt>SUN β</dt>
        <dd>{wander(t, 23.4, 0.4, 0.05).toFixed(2)}°</dd>
        <dt>SLEW</dt>
        <dd>1.8°/s</dd>
      </dl>
    </section>
  );
}

// The telemetry feed: the bird's orbit, its ground track, the X-band link and the station log.
const ORBIT_S = 240; // a lap is about 95 minutes; the readout runs it quick so it's seen to move

function OrionFeed({ t }: { t: number }) {
  const [log, setLog] = useState(() => Array.from({ length: 6 }, (_, i) => line(i)));
  useEffect(() => {
    if (still) return;
    let n = 6;
    const feed = setInterval(() => setLog((l) => [...l.slice(-7), line(n++)]), 650);
    return () => clearInterval(feed);
  }, []);

  const ph = ((t / ORBIT_S) * Math.PI * 2 + 1.1) % (Math.PI * 2);
  const lat = Math.asin(Math.sin(ph) * Math.sin((82.6 * Math.PI) / 180)) * (180 / Math.PI); // a 97.4° orbit tops out at 82.6°
  const lon = ((((ph * 180) / Math.PI - t * 0.25 + 40) % 360) + 540) % 360 - 180;
  const jitter = (a: number, b: number) => a + Math.sin(t * b) * a * 0.0004;
  const ll = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? pos : neg}`;
  // The ground track: one lap of latitude against longitude, and where the bird is on it.
  const track = Array.from({ length: 61 }, (_, i) => `${(i / 60) * 200},${30 - Math.sin((i / 60) * Math.PI * 2) * 24}`).join(' ');
  const dot = { x: (ph / (Math.PI * 2)) * 200, y: 30 - Math.sin(ph) * 24 };

  return (
    <section className="panel feed-panel orion-feed" data-testid="orion-feed">
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
    </section>
  );
}

// Power and the link budget, as bars.
function Power({ t }: { t: number }) {
  const meters: [string, number, string][] = [
    ['BATT SOC', wander(t, 0.86, 0.02, 0.07), `${Math.round(wander(t, 86, 2, 0.07))}%`],
    ['SOLAR', wander(t, 0.72, 0.08, 0.13, 1), `${Math.round(wander(t, 1440, 160, 0.13, 1))} W`],
    ['BUS TEMP', wander(t, 0.48, 0.05, 0.11, 2), `${wander(t, 21.6, 1.4, 0.11, 2).toFixed(1)}°C`],
    ['Eb/N0', wander(t, 0.64, 0.1, 0.43, 3), `${wander(t, 11.2, 1.6, 0.43, 3).toFixed(1)} dB`],
    ['RX AGC', wander(t, 0.55, 0.18, 0.9, 4), `${wander(t, -92, 6, 0.9, 4).toFixed(0)} dBm`],
  ];
  return (
    <section className="panel feed-panel power">
      <header>
        <b>POWER · LINK BUDGET</b>
        <span>BER 1e-9</span>
      </header>
      <ul className="meters">
        {meters.map(([k, v, text]) => (
          <li key={k}>
            <span>{k}</span>
            <i>
              <s style={{ width: `${Math.min(1, Math.max(0, v)) * 100}%` }} />
            </i>
            <b>{text}</b>
          </li>
        ))}
      </ul>
      <div className="dials two">
        <Dial label="WHEEL RPM" value={wander(t, 3120, 140, 0.19, 5)} min={0} max={6000} unit="" />
        <Dial label="ATT ERR" value={Math.abs(wander(t, 0.012, 0.008, 0.6, 6))} min={0} max={0.05} unit="°" />
      </div>
    </section>
  );
}

// The rest of the constellation, down the left: their feeds are dead.
const DEAD = [
  { name: 'ATLAS-1', id: 'NORAD 58402' },
  { name: 'VEGA-5', id: 'NORAD 58431' },
];

export function DeadFeeds() {
  return (
    <div className="feed-dead" data-depth="far" aria-hidden>
      {DEAD.map((d, i) => (
        <section key={d.name} className="panel feed-panel dead" style={{ '--on': `${780 + i * 160}ms` } as React.CSSProperties}>
          <header>
            <b>{d.name}</b>
            <span>{d.id}</span>
          </header>
          <Static seed={i} />
          <footer>
            <span>LINK LOST · LOS {stamp(new Date(Date.now() - (i + 2) * 3_600_000))}</span>
            <b>OFFLINE</b>
          </footer>
        </section>
      ))}
    </div>
  );
}

// Snow, a rolling bar and NO CARRIER over it.
function Static({ seed }: { seed: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const W = 120;
    const H = 68;
    c.width = W;
    c.height = H;
    const img = g.createImageData(W, H);
    let raf = 0;
    let last = 0;
    let roll = seed * 23;
    const paint = () => {
      roll = (roll + 1.6) % H;
      for (let y = 0; y < H; y++) {
        const bar = Math.abs(y - roll) < 6 ? 0.55 : 1;
        for (let x = 0; x < W; x++) {
          const v = Math.random() * 150 * bar;
          const i = (y * W + x) * 4;
          img.data[i] = v * 0.55;
          img.data[i + 1] = v;
          img.data[i + 2] = v * 0.8;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 60) return; // ~16 fps: it's meant to look cheap
      last = now;
      paint();
    };
    if (still) paint();
    else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seed]);
  return (
    <div className="static">
      <canvas ref={canvas} />
      <p>NO CARRIER</p>
    </div>
  );
}
