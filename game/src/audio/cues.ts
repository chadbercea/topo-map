import type { GameState } from '../sim/state';
import type { Sfx } from './sfx';
import { kindOf } from '../sim/comms';

// Which sounds a state change calls for. Pure, so it can be tested without audio.
export function cues(prev: GameState, next: GameState): Sfx[] {
  const out: Sfx[] = [];
  // New radio traffic that matters (calls and alerts; log lines stay quiet): who's calling
  // decides the tone.
  for (const m of next.comms.messages.slice(prev.comms.messages.length)) {
    if (m.status !== 'new' || kindOf(m) === 'log') continue;
    out.push(m.from === 'CLIENT' ? 'client' : m.from === 'HQ' ? 'hq' : 'radio');
  }
  const pm = prev.minigame;
  const nm = next.minigame;
  if (nm && nm.status === 'active' && (!pm || pm.startedMs !== nm.startedMs)) out.push(nm.kind === 'gridScan' ? 'ping' : 'tick');
  if (nm && pm && pm.startedMs === nm.startedMs) {
    if (nm.kind === 'gridScan' && nm.hits > pm.hits) out.push('ping');
    if (nm.kind === 'seekDestroy' && (nm.shots?.length ?? 0) > (pm.shots?.length ?? 0)) {
      out.push(nm.weapon === 'drone' ? 'boom' : nm.hits > pm.hits ? 'hit' : 'shot');
    }
  }
  if (next.team.fight && !prev.team.fight) out.push('burst');
  if (next.phase === 'ended' && prev.phase !== 'ended') out.push(next.mission.phase === 'complete' ? 'win' : 'fail');
  return out;
}
