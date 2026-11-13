import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './site.css';
import { Site } from './Site';

// Castle House's website (ILI-1336): its recruitment site, written as Castle House's own.
createRoot(document.getElementById('site')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
