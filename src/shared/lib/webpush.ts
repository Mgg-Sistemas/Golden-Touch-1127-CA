/* ============================================================
   Golden Touch · Web Push (cliente) — BORRADOR
   El lado CLIENTE para que la PWA instalada reciba notificaciones aunque esté
   cerrada: registra el service worker (public/sw.js), pide permiso, suscribe al
   push con la llave pública VAPID y guarda la suscripción en `push_subscriptions`.

   Falta el lado SERVIDOR (D27): un Edge Function que, al crearse una notificación,
   mande el Web Push a las suscripciones con la llave PRIVADA VAPID. Sin él, esto
   deja la app lista pero no llega ningún push todavía. La tabla `push_subscriptions`
   y la llave VAPID (VITE_VAPID_PUBLIC_KEY) las configura BD/infra.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
const SW_URL = '/sw.js';

/** ¿El navegador soporta service worker + push + notificaciones? */
export function soportaPush(): boolean {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && 'Notification' in window;
}

export function estadoPermisoNotif(): NotificationPermission | 'no-soportado' {
  if (!soportaPush()) return 'no-soportado';
  return Notification.permission;
}

let registro: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registra el service worker de push (idempotente, best-effort). Solo registra;
 *  NO pide permiso ni suscribe (eso va tras una acción del usuario). */
export function registrarServiceWorkerPush(): Promise<ServiceWorkerRegistration | null> {
  if (!soportaPush()) return Promise.resolve(null);
  if (!registro) {
    registro = navigator.serviceWorker.register(SW_URL).catch((e) => {
      console.warn('No se pudo registrar el service worker de push:', e);
      return null;
    });
  }
  return registro;
}

function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Sobre un ArrayBuffer explícito: así el tipo es Uint8Array<ArrayBuffer> y sirve como
  // applicationServerKey (BufferSource), sin el choque con ArrayBufferLike de TS 5.7.
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export interface ResultadoActivar { ok: boolean; motivo?: string; }

/** Pide permiso, suscribe al push y guarda la suscripción. Idempotente. */
export async function activarNotificaciones(): Promise<ResultadoActivar> {
  if (!soportaPush()) return { ok: false, motivo: 'Este navegador no soporta notificaciones push.' };
  if (!VAPID_PUBLIC) return { ok: false, motivo: 'Falta la llave pública VAPID (la configura infra/BD).' };
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'No se concedió el permiso de notificaciones.' };
  const reg = await registrarServiceWorkerPush();
  if (!reg) return { ok: false, motivo: 'No se pudo registrar el service worker.' };
  try {
    const previa = await reg.pushManager.getSubscription();
    const sub = previa ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    });
    await guardarSuscripcion(sub);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'No se pudo suscribir al push.' };
  }
}

/** Cancela la suscripción de este dispositivo y la borra del servidor. */
export async function desactivarNotificaciones(): Promise<void> {
  if (!soportaPush()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await borrarSuscripcion(sub.endpoint);
    await sub.unsubscribe().catch(() => { /* best-effort */ });
  }
}

async function guardarSuscripcion(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const { data: auth } = await supabase.auth.getUser();
  const fila = {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? null,
    auth: json.keys?.auth ?? null,
    user_id: auth.user?.id ?? null,
    user_email: auth.user?.email ?? null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };
  // Tabla `push_subscriptions` (SQL en borrador, D27). Mientras no exista, el upsert falla y
  // solo se avisa: la suscripción del navegador queda igual, solo no se registra en el servidor.
  try {
    const { error } = await supabase.from('push_subscriptions').upsert(fila, { onConflict: 'endpoint' });
    if (error) console.warn('No se guardó la suscripción push (¿tabla sin aplicar?):', error.message);
  } catch (e) {
    console.warn('No se guardó la suscripción push:', e);
  }
}

async function borrarSuscripcion(endpoint: string): Promise<void> {
  try { await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint); }
  catch { /* best-effort */ }
}
