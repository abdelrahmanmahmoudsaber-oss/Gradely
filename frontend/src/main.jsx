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

// Register PWA Service Worker & auto-update on new releases
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let refreshing = false;

  // When a new SW takes control, reload cleanly to display fresh updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // 1. Immediately check for updates on load
      reg.update().catch(() => {});

      // 2. Check for updates whenever window regains focus (e.g. returning to PWA)
      window.addEventListener('focus', () => {
        reg.update().catch(() => {});
      });

      // 3. Check for updates on visibility change
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      });

      // 4. Background periodic update check (every 3 minutes)
      setInterval(() => {
        reg.update().catch(() => {});
      }, 3 * 60 * 1000);

      // 5. If new worker is waiting, activate it immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
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
