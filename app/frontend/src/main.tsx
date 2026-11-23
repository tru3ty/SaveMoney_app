import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isDemoMode } from './lib/mode';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && isDemoMode && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      console.warn('Офлайн-режим демо недоступен.');
    });
  }, { once: true });
}
