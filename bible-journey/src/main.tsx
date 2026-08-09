import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { lockZoom } from './lib/zoom.ts';
import './styles/app.css';

// Before the first paint, so a pinch during startup is refused too.
lockZoom();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The outer net. Anything the per-view boundary cannot catch, including a
        throw from the store or the cloud provider, stops here rather than at a
        white page. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

/*
 * Production only. A service worker in front of the dev server caches modules
 * Vite expects to serve fresh, which is the "blank page after heavy editing"
 * failure with an extra day of confusion attached.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      // Offline support is a bonus, never a requirement for the app to run.
      console.warn('Offline support unavailable', err);
    });
  });
}
