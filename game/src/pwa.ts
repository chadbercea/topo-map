import { registerSW } from 'virtual:pwa-register';

// The war room as an app (ILI-1335): the service worker keeps the game's build on the device so
// it plays offline. A new build installs quietly and waits; it takes over the next time the game
// is launched, so nothing ever reloads under a mission in progress. Not under test automation,
// unless the URL asks (?sw).
const asked = new URLSearchParams(location.search).has('sw');
export function startPwa() {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.webdriver && !asked) return;
  registerSW({ immediate: true, onNeedRefresh() {}, onOfflineReady() {} });
}
