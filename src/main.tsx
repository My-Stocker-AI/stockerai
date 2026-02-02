import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // NUCLEAR OPTION: Unregister ALL existing service workers first
      // This ensures stale service workers don't serve cached broken code
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('[SW] Found', registrations.length, 'existing service worker(s)');

      for (const registration of registrations) {
        const unregistered = await registration.unregister();
        console.log('[SW] Unregistered existing service worker:', unregistered);
      }

      // Clear all caches
      const cacheNames = await caches.keys();
      console.log('[SW] Found', cacheNames.length, 'cache(s)');
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log('[SW] Deleted cache:', cacheName);
      }

      // Wait a moment for unregistration to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now register fresh service worker
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      console.log('[SW] Registered FRESH service worker:', registration.scope);

      // Force immediate update check
      registration.update();

      // If there's a waiting service worker, activate it immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('[SW] Setup failed:', error);
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
