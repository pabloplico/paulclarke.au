import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted variable fonts: bundled by Vite, so the site makes no third-party requests
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './globals.css';
import { App } from './App';
import { legacyHashToPath } from './lib/legacy-hash';

// Redirect old hash URLs (e.g. /#assess) before the router reads the location
if (window.location.pathname === '/') {
  const path = legacyHashToPath(window.location.hash);
  if (path) window.history.replaceState(null, '', path);
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
