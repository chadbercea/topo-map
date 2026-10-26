// The sound effect pack (GDD audio: nice to have if it's cheap). Every sound is synthesized
// with WebAudio, so there are no files to load or license. Browsers only allow audio after
// the player has touched the page, so the context starts on the first input.

export type Sfx = 'radio' | 'client' | 'hq' | 'ping' | 'shot' | 'hit' | 'boom' | 'burst' | 'win' | 'fail' | 'tick';

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(gain, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.2, lowpass = 1200) {
  const c = ctx!;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

const SOUNDS: Record<Sfx, () => void> = {
  radio: () => (noise(0, 0.05, 0.08, 3000), tone(1200, 0.05, 0.07, 'square', 0.05), tone(1600, 0.13, 0.07, 'square', 0.05)),
  client: () => (tone(880, 0, 0.12, 'triangle', 0.08), tone(660, 0.14, 0.18, 'triangle', 0.08)),
  hq: () => (tone(520, 0, 0.1, 'sine', 0.08), tone(780, 0.1, 0.12, 'sine', 0.08)),
  ping: () => tone(1400, 0, 0.35, 'sine', 0.09, 900),
  tick: () => tone(2000, 0, 0.04, 'square', 0.04),
  shot: () => noise(0, 0.12, 0.25, 2500),
  hit: () => (noise(0, 0.15, 0.3, 1800), tone(180, 0, 0.2, 'sawtooth', 0.06, 60)),
  boom: () => (noise(0, 0.9, 0.5, 600), tone(90, 0, 0.8, 'sine', 0.25, 30)),
  burst: () => [0, 0.09, 0.18, 0.27, 0.36].forEach((t) => noise(t, 0.07, 0.18, 2200)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.08)),
  fail: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.2, 0.4, 'sawtooth', 0.05)),
};

let muted = false;
export const setMuted = (m: boolean) => (muted = m);

export function play(s: Sfx) {
  if (muted || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  SOUNDS[s]();
}
