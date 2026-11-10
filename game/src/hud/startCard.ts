import { useSyncExternalStore } from 'react';

// The mission start card (ILI-1421) stays until HQ dismisses it; nothing else asks for HQ until
// then. Under test automation it starts dismissed, unless the URL asks (?startcard): a test of
// something else isn't a test of the opening.
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true && !new URLSearchParams(location.search).has('startcard');
let dismissed = automated;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  dismissed = v;
  listeners.forEach((l) => l());
};
export const startCard = {
  dismissed: () => dismissed,
  dismiss: () => set(true),
  reset: () => set(automated), // a new mission shows it again
  subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
};
export const useStartDismissed = () => useSyncExternalStore(startCard.subscribe, startCard.dismissed);
