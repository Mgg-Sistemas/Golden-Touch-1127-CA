import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

const LOCK_PREFIX = 'gt-auth-lock:';
const STALE_MS = 10_000; // un lock más viejo que esto se considera abandonado (pestaña cerrada/colgada)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Mismo contrato que el `LockAcquireTimeoutError` de @supabase/auth-js: su tick de
 * auto-refresco IGNORA en silencio los errores con `isAcquireTimeout` (es un timeout
 * benigno: otra pestaña tiene el lock y se reintenta en el próximo tick). Si lanzáramos
 * un Error genérico, Supabase no lo reconoce y se escapa como «Uncaught (in promise)».
 */
class LockAcquireTimeoutError extends Error {
  readonly isAcquireTimeout = true;
  constructor(message: string) {
    super(message);
    this.name = 'LockAcquireTimeoutError';
  }
}

/**
 * Lock de refresco de sesión coordinado ENTRE PESTAÑAS vía localStorage.
 *
 * Supabase usa `navigator.locks` (Web Locks API) para que dos pestañas no
 * refresquen el token a la vez (la rotación del refresh token invalidaría al
 * segundo y lo sacaría con 403). Pero `navigator.locks` SOLO existe en contexto
 * seguro (HTTPS o localhost); sirviendo por HTTP plano (Droplet con IP) no está,
 * y sin coordinación el cambio de pestaña cierra sesión. Este lock lo suple.
 */
async function localStorageLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  // Sin localStorage (entornos raros) no coordinamos: ejecutamos directo.
  if (typeof localStorage === 'undefined') return fn();

  const key = LOCK_PREFIX + name;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const start = Date.now();

  // Adquirir: gana el último que escribe, confirmando tras una micro-espera.
  for (;;) {
    const now = Date.now();
    let held: { token: string; at: number } | null = null;
    try { const raw = localStorage.getItem(key); held = raw ? JSON.parse(raw) : null; } catch { held = null; }

    if (!held || now - held.at > STALE_MS) {
      localStorage.setItem(key, JSON.stringify({ token, at: now }));
      await sleep(15 + Math.random() * 25);
      let mine = false;
      try { const raw = localStorage.getItem(key); mine = !!raw && JSON.parse(raw).token === token; } catch { mine = false; }
      if (mine) break; // adquirido
    }

    // timeout 0 = no bloqueante (lo usa el tick de auto-refresco): si no se adquirió
    // de inmediato, se descarta YA como timeout benigno (igual que el lock nativo).
    if (acquireTimeout === 0 || (acquireTimeout > 0 && now - start > acquireTimeout)) {
      throw new LockAcquireTimeoutError(`No se pudo adquirir el lock de auth «${name}» a tiempo.`);
    }
    await sleep(25 + Math.random() * 35);
  }

  try {
    return await fn();
  } finally {
    try {
      const raw = localStorage.getItem(key);
      if (raw && JSON.parse(raw).token === token) localStorage.removeItem(key);
    } catch { /* liberación best-effort */ }
  }
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase no configurado. Copia .env.example a .env.local y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
    );
  }
  if (!client) {
    // ¿Hay Web Locks nativo (contexto seguro: HTTPS/localhost)? Entonces dejamos que
    // Supabase use el suyo. Si no (HTTP plano con IP), inyectamos el lock por
    // localStorage para que dos pestañas no se peleen el refresco del token.
    // NO tocamos storageKey: así las sesiones ya iniciadas siguen válidas.
    const tieneWebLocks = typeof navigator !== 'undefined' && 'locks' in navigator && !!navigator.locks;
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(tieneWebLocks ? {} : { lock: localStorageLock }),
      },
    });
  }
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabase();
    const value = Reflect.get(c, prop);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
