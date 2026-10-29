import type { ReactNode } from 'react';
import { useGame } from '../sim/store';
import { weather, type Weather } from '../sim/conditions';
import { zulu } from '../sim/gameTime';

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const VIS_MAX_KM = 15; // the forecast's clearest

// ENVIRONMENT (ILI-1218): the AO's conditions as a war-room readout. On a wide screen a grid of
// tiles above ORION-3, each with its icon, its label and its value: sky, visibility, wind (the
// arrow points where it blows), temperature, light and cloud cover. On a fold or phone (slim)
// one line of icons and values.
export function EnvWidget({ slim = false }: { slim?: boolean }) {
  const s = useGame((x) => x);
  const wx = weather(s);
  const tiles: { key: string; label: string; icon: ReactNode; value: string; sub?: ReactNode }[] = [
    { key: 'sky', label: 'Sky', icon: <Cloud />, value: wx.sky },
    { key: 'vis', label: 'Visibility', icon: <Eye />, value: `${wx.visibilityKm} km`, sub: <Meter value={wx.visibilityKm / VIS_MAX_KM} label="Visibility" /> },
    { key: 'wind', label: 'Wind', icon: <Arrow deg={(COMPASS[wx.wind.from] ?? 0) + 180} />, value: `${wx.wind.from} ${wx.wind.kmh} km/h` },
    { key: 'temp', label: 'Temp', icon: <Thermo />, value: `${wx.tempC}°C` },
    { key: 'light', label: 'Light', icon: wx.light === 'Day' ? <Sun /> : <Moon dawn={wx.light === 'First light'} />, value: wx.light },
    { key: 'cloud', label: 'Cloud', icon: <Cloud />, value: `${wx.cloudPct}%`, sub: <Meter value={wx.cloudPct / 100} label="Cloud cover" /> },
  ];

  if (slim)
    return (
      <section className="panel small-widget env slim" data-testid="conditions" aria-label="Environment">
        <p className="wx" data-testid="weather">
          {tiles.slice(0, 5).map((t) => (
            <span key={t.key} className="env-bit" title={t.label}>
              {t.icon}
              {t.value}
            </span>
          ))}
        </p>
      </section>
    );

  return (
    <section className="panel env-hud" data-testid="conditions" data-wx={wx.light} aria-label="Environment">
      <h2>
        <span>ENVIRONMENT</span>
        <span className="env-stamp">AO · {zulu(s.elapsedMs)}</span>
      </h2>
      <dl className="env-grid" data-testid="weather" aria-label={describe(wx)}>
        {tiles.map((t) => (
          <div key={t.key} className="env-tile" data-key={t.key}>
            <dt>
              {t.icon}
              {t.label}
            </dt>
            <dd>{t.value}</dd>
            {t.sub}
          </div>
        ))}
      </dl>
    </section>
  );
}

// The whole readout in one line, for screen readers and tests.
const describe = (w: Weather) => `${w.sky} · vis ${w.visibilityKm} km · wind ${w.wind.from} ${w.wind.kmh} km/h · ${w.tempC}°C · ${w.light}`;

function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="env-meter" role="meter" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v * 100}%` }} />
    </span>
  );
}

// Line icons, 16 px, in the text's colour.
const Icon = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <svg className="env-icon" viewBox="0 0 16 16" aria-hidden style={style}>
    {children}
  </svg>
);
const Cloud = () => (
  <Icon>
    <path d="M4.5 12.5h7a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5Z" />
  </Icon>
);
const Eye = () => (
  <Icon>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);
const Arrow = ({ deg }: { deg: number }) => (
  <Icon style={{ transform: `rotate(${deg}deg)` }}>
    <path d="M8 14V2.5M4 6.5 8 2.5l4 4" />
  </Icon>
);
const Thermo = () => (
  <Icon>
    <path d="M6.5 9.3V3a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0Z" />
    <path d="M8 6v5" />
  </Icon>
);
const Sun = () => (
  <Icon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
  </Icon>
);
const Moon = ({ dawn }: { dawn: boolean }) => (
  <Icon>
    <path d="M12.5 10.5A5.5 5.5 0 0 1 5.5 3.5a5.5 5.5 0 1 0 7 7Z" />
    {dawn && <path d="M1 14.5h14" />}
  </Icon>
);
