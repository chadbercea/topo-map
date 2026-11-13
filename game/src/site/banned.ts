// What Castle House's site never says (ILI-1336, ILI-1480): nothing about a game, a test, fiction
// or satire, nobody playing, no one operation's names or numbers, and no callsigns. Shared by the
// unit check (site.test.ts) and the browser check (e2e/castle-house.spec.ts).
export const BANNED: RegExp[] = [
  /\bgames?\b/i,
  /\bgaming\b/i,
  /\btest(s|ed|ing)?\b/i,
  /fiction/i,
  /satir/i,
  /\bplay(s|ed|er|ers|ing|able)?\b/i,
  /\bmissions?\b/i,
  /war room/i,
  /black box/i,
  /\bALPHA\b/,
  /ORION/i,
  /REAPER|HAMMER-|RAVEN-/,
  /escrow/i,
  /ten minutes/i,
  /the chair is/i,
  /the team is moving/i,
  /coming soon/i,
];
