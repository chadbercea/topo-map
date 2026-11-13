import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '../styles.css';
import './design.css';
import { DesignSystem } from './DesignSystem';

// PMC War Room's design system (ILI-1324): a living reference, built from the game's own
// stylesheet, components and scenes, so it can't drift from the game.
createRoot(document.getElementById('ds')!).render(
  <StrictMode>
    <DesignSystem />
  </StrictMode>,
);
