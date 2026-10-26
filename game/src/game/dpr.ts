// Phaser has no device-pixel-ratio setting, so the game runs at device pixels and its
// zoom scales the canvas back to CSS size. Scenes multiply CSS-pixel sizes by DPR.
export const DPR = Math.min(window.devicePixelRatio || 1, 2);
