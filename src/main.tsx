import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

declare global {
  interface Window {
    __balanceLog?: (message: string) => void;
  }
}

window.__balanceLog?.('main-loaded');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

window.__balanceLog?.('react-render-called');

if ('serviceWorker' in navigator) {
  window.__balanceLog?.('service-worker-unregister-start');
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
    window.__balanceLog?.(`service-worker-unregister-done:${registrations.length}`);
  }).catch(() => {
    window.__balanceLog?.('service-worker-unregister-failed');
    // PWA caching is optional; the app should never fail because of service workers.
  });
}
