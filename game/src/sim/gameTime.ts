// Game time (ILI-1190): the sim runs in real milliseconds, but the player reads hours and
// minutes at the scale of a foot patrol. 24× turns the ten-minute contract window into four
// hours, and the team's pace (a 500 m square in ~28 s) into ~2.6 km/h.

export const TIME_SCALE = 24;

const minutes = (ms: number, round: (n: number) => number) => Math.max(0, round((ms * TIME_SCALE) / 60_000));

// A clock reading, H:MM. Countdowns round up, timestamps round down.
export function gameClock(ms: number, round: (n: number) => number = Math.ceil) {
  const m = minutes(ms, round);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// A span of game time in words: "25 min", "1 h 40 min".
// A short wait counted down in real time, m:ss, as the strike and exfil panels count theirs
// (ILI-1269): ORION-3's slews use it too.
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function gameSpan(ms: number) {
  const m = minutes(ms, Math.ceil);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

// Time of day at the desk, for the intel stream's stamps: the theater's morning starts at
// 0540Z, and the backlog from before the player sat down reads earlier.
const DAWN_MIN = 5 * 60 + 40;
export function zulu(theaterMs: number) {
  const m = (((DAWN_MIN + Math.floor((theaterMs * TIME_SCALE) / 60_000)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}Z`;
}
