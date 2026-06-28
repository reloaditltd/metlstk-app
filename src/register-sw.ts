// Service worker registration (moved out of index.html so the CSP needs no
// 'unsafe-inline' for scripts — Vite bundles this with the rest of the app).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
