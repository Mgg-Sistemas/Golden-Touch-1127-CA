/* ============================================================
   Golden Touch · Service Worker de notificaciones (Web Push) — BORRADOR
   Solo PUSH: sin caché ni handler de `fetch`, para NO interferir con la carga
   ni con las actualizaciones de la app (que ya maneja main.tsx). Muestra la
   notificación cuando llega un push del servidor y, al tocarla, abre/enfoca la
   app en la ruta indicada.

   El ENVÍO del push lo hará un Edge Function (con la llave privada VAPID) —
   todavía no existe (D27). Sin ese lado servidor, este SW queda instalado pero
   no recibe nada; con él, entrega aunque la PWA esté cerrada.
   ============================================================ */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Golden Touch 1127 C.A.';
  const options = {
    body: data.body || data.message || '',
    icon: data.icon || '/LOGO.jpg',
    badge: '/LOGO.jpg',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || data.link || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of clientes) {
      if ('focus' in cliente) {
        try {
          await cliente.focus();
          if (url && 'navigate' in cliente) await cliente.navigate(url);
          return;
        } catch (_e) { /* si no deja navegar, al menos quedó enfocada */ }
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
