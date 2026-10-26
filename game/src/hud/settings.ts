import type { Settings } from '../sim/state';

// Settings are a per-device preference; storage can be missing (private mode), so fail quietly.
const KEY = 'pmc-war-room:settings';

export function loadSettings(): Settings | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { sound: true, ...JSON.parse(raw) } : undefined;
  } catch {
    return undefined;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not persisted; the setting still applies for this session
  }
}
