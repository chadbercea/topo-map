import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './site.css';
import { Site } from './Site';

// Castle House's corporate website (ILI-1333): the fictional PMC from PMC War Room, selling itself.
createRoot(document.getElementById('site')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
