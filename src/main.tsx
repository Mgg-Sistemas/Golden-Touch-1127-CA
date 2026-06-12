import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { instalarSelectOnFocusMonto } from './shared/lib/selectOnFocus';
import { instalarMayusculaAutomatica } from './shared/lib/mayusculaInputs';
import './styles/index.css';

// Al enfocar un campo numérico que muestra 0, selecciona el 0 para reemplazarlo.
instalarSelectOnFocusMonto();
// Mayúscula automática global en los campos de texto (con exclusiones: correo,
// contraseña, números y buscadores).
instalarMayusculaAutomatica();

// Recuperación tras un despliegue: si la app tenía el index.html viejo en caché y
// un chunk con hash ya no existe (404), el lazy-import falla y la pantalla queda en
// negro. Vite emite `vite:preloadError`; recargamos UNA vez para traer los assets
// nuevos. La guarda por tiempo evita un bucle si la recarga tampoco resuelve.
function recargarTrasFalloDeChunk() {
  const KEY = 'gt-preload-reload-at';
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 15000) return; // ya recargamos hace poco → no insistir
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* sin sessionStorage: igual recargamos */ }
  window.location.reload();
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault(); // evita que el error sin manejar rompa la app
  recargarTrasFalloDeChunk();
});
// Respaldo: algunos navegadores reportan el fallo de import dinámico como
// "Failed to fetch dynamically imported module" en un rejection no manejado.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message ?? e?.reason ?? '');
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    recargarTrasFalloDeChunk();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
