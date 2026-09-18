// Golden Touch · Helper compartido de las Edge Functions tasa-* (bcv, binance-p2p,
// cop, metales). Centraliza: quién llama, throttle en servidor y fetch con timeout.
//
// ── QUIÉN PUEDE LLAMARLAS ─────────────────────────────────────────────
// 1. Un usuario con sesión válida y cuenta activa (exigirSesion). Si además es
//    admin pleno (is_admin: activo y sin cambio de clave pendiente) puede
//    mandar { force: true } y saltarse el throttle.
// 2. Una llamada de servicio (el cron de pg_cron):
//      · header `x-tasas-cron` igual al secreto TASAS_CRON_SECRET, o
//      · Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
// 3. MODO TRANSICIÓN: mientras TASAS_EXIGIR_AUTH no valga '1', un JWT del
//    proyecto SIN usuario (la anon key, que es lo que manda hoy el cron
//    `tasa-binance-3-al-dia`) también pasa, pero solo con el throttle de 10 min
//    y sin force. Una cuenta inactiva nunca pasa (403), ni en transición.
//    Cuando el cron nuevo (supabase/2026-09-18-tasas-cron-seguro.sql) esté
//    aplicado y corriendo, se pone TASAS_EXIGIR_AUTH=1 y la anon queda afuera.
//
// ── THROTTLE ──────────────────────────────────────────────────────────
// No se inserta un snapshot si ya hay uno del mismo par hace menos de
// THROTTLE_MIN minutos (salvo force de un admin): se devuelve lo guardado.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { exigirSesion, esAdminPleno, json, type Sesion } from './auth.ts';

export { CORS, json } from './auth.ts';

export const THROTTLE_MIN = 10;
export const FETCH_TIMEOUT_MS = 8000;

export type Llamador =
  | { tipo: 'usuario'; sesion: Sesion; esAdmin: boolean; db: SupabaseClient }
  | { tipo: 'servicio'; db: SupabaseClient }
  | { tipo: 'anon'; db: SupabaseClient };

/** Comparación en tiempo constante (para secretos). */
function igualSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function clienteServicio(): SupabaseClient | Response {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Supabase env vars faltantes' }, 500);
  return createClient(url, serviceKey);
}

/** ¿Es una llamada de servicio (cron) con credencial propia? */
export function esLlamadaServicio(req: Request): boolean {
  const secreto = Deno.env.get('TASAS_CRON_SECRET') ?? '';
  const header = req.headers.get('x-tasas-cron') ?? '';
  if (secreto.length >= 32 && header && igualSeguro(header, secreto)) return true;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return Boolean(serviceKey && bearer && igualSeguro(bearer, serviceKey));
}

/**
 * Identifica al llamador según las reglas de arriba. Devuelve `Response` si hay
 * que cortar (401/403/500).
 */
export async function identificarLlamador(req: Request): Promise<Llamador | Response> {
  if (esLlamadaServicio(req)) {
    const db = clienteServicio();
    if (db instanceof Response) return db;
    return { tipo: 'servicio', db };
  }

  const s = await exigirSesion(req);
  if (!(s instanceof Response)) {
    return { tipo: 'usuario', sesion: s, esAdmin: await esAdminPleno(s), db: s.admin };
  }

  // 401 = no hay usuario detrás del JWT (p. ej. la anon key del cron viejo).
  // 403 (cuenta inactiva / no registrada) y 500 se devuelven tal cual.
  if (s.status === 401 && Deno.env.get('TASAS_EXIGIR_AUTH') !== '1') {
    const db = clienteServicio();
    if (db instanceof Response) return db;
    return { tipo: 'anon', db };
  }
  return s;
}

/** force solo cuenta si lo pide un admin pleno. */
export function forceDeAdmin(l: Llamador, payload: { force?: unknown }): boolean {
  return payload.force === true && l.tipo === 'usuario' && l.esAdmin;
}

/** fetch con timeout (AbortSignal.timeout). */
export function fetchT(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** Lee el body JSON; si no hay o es inválido, {}. */
export async function leerPayload<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    const txt = await req.text();
    if (!txt.trim()) return {};
    const v = JSON.parse(txt);
    return v && typeof v === 'object' ? v as Partial<T> : {};
  } catch {
    return {};
  }
}

export type Snap = { par: string; tasa: number; at: string; fuente: string };

/** Último snapshot de cada par pedido (cualquier antigüedad). */
export async function ultimosSnapshots(db: SupabaseClient, pares: string[]): Promise<Map<string, Snap>> {
  const out = new Map<string, Snap>();
  await Promise.all(pares.map(async (par) => {
    const { data, error } = await db
      .from('tasa_snapshot')
      .select('par, tasa, at, fuente')
      .eq('par', par)
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) out.set(par, { par, tasa: Number(data.tasa), at: String(data.at), fuente: String(data.fuente) });
  }));
  return out;
}

/** ¿El snapshot tiene menos de THROTTLE_MIN minutos? */
export function esReciente(s: { at: string } | undefined | null, minutos = THROTTLE_MIN): boolean {
  if (!s) return false;
  const t = new Date(s.at).getTime();
  return Number.isFinite(t) && Date.now() - t < minutos * 60_000;
}

export function fechaHoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }

/** Número finito y > 0, o null. */
export function positivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
