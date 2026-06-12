import { toast, type ToastKind } from '@/shared/ui/Toast';
import { push } from '@/modules/notificaciones/notif.repository';

const TOAST_KIND_TO_NOTIF: Record<ToastKind, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info', success: 'success', warning: 'warning', error: 'error',
};

const refreshListeners = new Set<() => void>();

/** Suscriptores (campana del topbar) que se refrescan cuando llega una notif nueva. */
export function onNotifRefresh(cb: () => void): () => void {
  refreshListeners.add(cb);
  return () => refreshListeners.delete(cb);
}

function emitRefresh() {
  refreshListeners.forEach((fn) => {
    try { fn(); } catch { /* listener faltante: ignorar */ }
  });
}

/** Refresca la campana cuando se persiste una notif por fuera de notify()
 *  (ej. el aviso de combustible bajo, que no muestra toast). */
export function emitNotifRefresh(): void { emitRefresh(); }

export interface NotifyOptions {
  /** Persistir además en la tabla `notificaciones` (campana). Default: true. */
  persist?: boolean;
  /** Cuerpo opcional para la notif persistida (si es distinto del título del toast). */
  detail?: string;
  /** Link de la notif (ruta del app). */
  link?: string;
  /** Clave única para dedup (evita duplicados no leídos). */
  dedup_key?: string;
  /** Destinatario lógico ('all' por default). */
  destino?: string;
}

/**
 * Helper unificado: muestra toast, reproduce sonido (vía toast()) y persiste
 * el evento en la tabla `notificaciones` para que aparezca en la campana.
 * Si la persistencia falla, igual se ve el toast y suena.
 */
export function notify(
  message: string,
  kind: ToastKind = 'info',
  options: NotifyOptions = {},
): void {
  toast(message, kind);
  if (options.persist === false) return;
  push({
    kind: TOAST_KIND_TO_NOTIF[kind],
    title: message,
    message: options.detail ?? null,
    link: options.link ?? null,
    dedup_key: options.dedup_key ?? null,
    destino: options.destino ?? 'all',
  })
    .then(() => emitRefresh())
    .catch(() => { /* persistencia best-effort: ya se mostró el toast */ });
}
