import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Auto-reload when a deployed chunk hash changes (fixes mobile browser stale cache)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'gradely_last_preload_reload';
  const lastReload = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
  if (Date.now() - lastReload > 8000) {
    sessionStorage.setItem(reloadKey, String(Date.now()));
    window.location.reload();
  }
});

// Register PWA Service Worker if supported
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Check for updates periodically
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - notify or update cleanly
              console.log('Gradely update installed, ready to reload.');
            }
          });
        }
      });
    }).catch(err => {
      console.warn('SW registration notice:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
