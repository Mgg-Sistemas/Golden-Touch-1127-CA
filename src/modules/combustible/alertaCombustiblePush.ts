/* ============================================================
   Golden Touch · Alerta Roja de Combustible y Notificaciones Push
   
   Reglas de negocio:
   1. Se dispara cuando la alerta roja de poco combustible en los tanques
      está activa (combustible general <= UMBRAL_COMBUSTIBLE_BAJO [6.000 L]
      o tanques individuales con nivel crítico < 12% o vacíos).
   2. Destinatarios: todos los usuarios con permisos de algún tipo sobre
      el módulo de combustible (admin, can('combustible'), vista de surtidor,
      o cualquier permiso granular en roles_permisos.combustible).
   3. Anti-saturación: se envía UNA sola vez por acceso al sistema o al módulo,
      con cooldown para evitar ráfagas si el usuario navega entre pantallas.
   ============================================================ */

import {
  combustibleDisponibleGeneral,
  UMBRAL_COMBUSTIBLE_BAJO,
  listTanques,
  esBidon,
} from './tanques.repository';
import { emitirWebPush } from '@/shared/lib/webpush';
import { push as pushNotif } from '@/modules/notificaciones/notif.repository';
import { emitNotifRefresh } from '@/shared/lib/notify';
import { num } from '@/shared/lib/format';
import type { ModuleKey, RolePermisos } from '@/modules/usuarios/permisos.repository';
import type { VistaTelefonoKey } from '@/modules/auth/vistasTelefono';
import type { PermLevel } from '@/modules/auth/PermissionsContext';

/** Claves de almacenamiento de sesión para control anti-saturación */
export const STORAGE_PUSH_SISTEMA = 'gt.combustible.push.sistema_visto';
export const STORAGE_PUSH_MODULO = 'gt.combustible.push.modulo_visto';
export const STORAGE_PUSH_ULTIMO_ENVIO = 'gt.combustible.push.ultimo_envio';

/** Cooldown mínimo (en ms) entre notificaciones push de combustible (10 minutos) */
export const COOLDOWN_PUSH_MS = 10 * 60 * 1000;

/** Umbral de porcentaje (12%) para considerar un tanque en nivel crítico (barra roja en UI) */
export const UMBRAL_PCT_CRITICO_TANQUE = 12;

// Fallbacks de almacenamiento en memoria para SSR o tests en Node.js
const memorySession = new Map<string, string>();
const memoryLocal = new Map<string, string>();

function getSessionItem(key: string): string | null {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  return memorySession.get(key) ?? null;
}

function setSessionItem(key: string, val: string): void {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem(key, val); } catch { /* ignore */ }
  }
  memorySession.set(key, val);
}

function removeSessionItem(key: string): void {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }
  memorySession.delete(key);
}

function getLocalItem(key: string): string | null {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return memoryLocal.get(key) ?? null;
}

function setLocalItem(key: string, val: string): void {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(key, val); } catch { /* ignore */ }
  }
  memoryLocal.set(key, val);
}

export function limpiarMemoriaStorageParaTests(): void {
  memorySession.clear();
  memoryLocal.clear();
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.clear(); } catch { /* ignore */ }
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.clear(); } catch { /* ignore */ }
  }
}

export interface TanqueCriticoInfo {
  id: string;
  nombre: string;
  saldo: number;
  capacidad: number;
  pct: number;
}

export interface EstadoAlertaRojaCombustible {
  activa: boolean;
  motivo: 'general' | 'tanque_critico' | 'ambos' | null;
  litrosGeneral: number;
  umbralGeneral: number;
  tanquesCriticos: TanqueCriticoInfo[];
  titulo: string;
  cuerpo: string;
}

export interface ContextoPermisosCombustible {
  isAdmin?: boolean;
  can?: (module: ModuleKey, level?: PermLevel) => boolean;
  puedeVista?: (vista: VistaTelefonoKey) => boolean;
  role?: string | null;
  permisos?: RolePermisos | null;
}

/**
 * Determina si el usuario logueado tiene permisos de algún tipo sobre el módulo de combustible.
 * Incluye administradores, usuarios con can('combustible'), operadores de surtidor móvil y roles afines.
 */
export function tienePermisoCombustible(ctx?: ContextoPermisosCombustible | null): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  if (typeof ctx.can === 'function' && ctx.can('combustible')) return true;
  if (typeof ctx.puedeVista === 'function' && ctx.puedeVista('surtidor')) return true;
  const rol = (ctx.role ?? '').trim().toLowerCase();
  if (rol === 'combustible' || rol.includes('combustible')) return true;
  const cp = ctx.permisos?.combustible;
  if (cp && (cp.lectura || cp.escritura || cp.full)) {
    return true;
  }
  return false;
}

/**
 * Consulta la base de datos y evalúa si la alerta roja de combustible está activa.
 */
export async function verificarAlertaRojaCombustible(): Promise<EstadoAlertaRojaCombustible> {
  const [litrosGeneral, tanques] = await Promise.all([
    combustibleDisponibleGeneral().catch(() => 0),
    listTanques().catch(() => []),
  ]);

  const tanquesCriticos: TanqueCriticoInfo[] = [];

  for (const t of tanques) {
    if (t.estado && t.estado !== 'activo') continue;
    if (esBidon(t.nombre)) continue; // Los bidones no acumulan saldo ni tienen reserva

    const cap = Number(t.capacidad_litros) || 0;
    const saldo = Number(t.saldo_litros) || 0;
    const pct = cap > 0 ? Math.max(0, Math.min(100, (saldo / cap) * 100)) : 0;

    // Alerta roja individual si el tanque tiene capacidad y pct < 12% o si saldo <= 0
    if (cap > 0 && pct < UMBRAL_PCT_CRITICO_TANQUE) {
      tanquesCriticos.push({
        id: t.id,
        nombre: t.nombre,
        saldo,
        capacidad: cap,
        pct: Math.round(pct * 10) / 10,
      });
    }
  }

  const bajoGeneral = litrosGeneral <= UMBRAL_COMBUSTIBLE_BAJO;
  const hayTanquesCriticos = tanquesCriticos.length > 0;
  const activa = bajoGeneral || hayTanquesCriticos;

  let motivo: EstadoAlertaRojaCombustible['motivo'] = null;
  if (bajoGeneral && hayTanquesCriticos) motivo = 'ambos';
  else if (bajoGeneral) motivo = 'general';
  else if (hayTanquesCriticos) motivo = 'tanque_critico';

  let cuerpo = '';
  if (bajoGeneral) {
    cuerpo = `El combustible general bajó a ${num(litrosGeneral)} ltrs (mínimo ${num(UMBRAL_COMBUSTIBLE_BAJO)} ltrs). Se debe reponer.`;
    if (hayTanquesCriticos) {
      const detalleTanques = tanquesCriticos.map((tk) => `${tk.nombre} (${num(tk.saldo)} ltrs / ${tk.pct}%)`).join(', ');
      cuerpo += ` Tanques críticos: ${detalleTanques}.`;
    }
  } else if (hayTanquesCriticos) {
    const detalleTanques = tanquesCriticos.map((tk) => `${tk.nombre} (${num(tk.saldo)} ltrs / ${tk.pct}%)`).join(', ');
    cuerpo = `Nivel crítico en tanque(s): ${detalleTanques}. Se requiere atención inmediata.`;
  }

  return {
    activa,
    motivo,
    litrosGeneral,
    umbralGeneral: UMBRAL_COMBUSTIBLE_BAJO,
    tanquesCriticos,
    titulo: '⛽ Alerta: Poco combustible en tanques',
    cuerpo,
  };
}

export type TipoAccesoCombustible = 'sistema' | 'modulo';

export interface OpcionesNotificarCombustible {
  tipoAcceso: TipoAccesoCombustible;
  perms: ContextoPermisosCombustible;
  /** Forzar el envío ignorando marcas previas de sesión (ej. test o botón manual) */
  forzar?: boolean;
}

export interface ResultadoNotificacionCombustible {
  enviado: boolean;
  motivo?: 'sin_permiso' | 'alerta_inactiva' | 'ya_notificado_en_sesion' | 'cooldown_activo' | 'error_push';
  alerta?: EstadoAlertaRojaCombustible;
}

/**
 * Evalúa y emite la notificación push de combustible bajo respetando:
 * 1. Permisos del usuario sobre el módulo combustible.
 * 2. Estado de alerta roja activo.
 * 3. Anti-saturación (1 vez por acceso al sistema o al módulo, respetando cooldown de 10 min).
 */
export async function notificarCombustibleBajoSiAplica(
  opciones: OpcionesNotificarCombustible,
): Promise<ResultadoNotificacionCombustible> {
  const { tipoAcceso, perms, forzar = false } = opciones;

  // 1. Validar permisos
  if (!tienePermisoCombustible(perms)) {
    return { enviado: false, motivo: 'sin_permiso' };
  }

  const claveStorage = tipoAcceso === 'sistema' ? STORAGE_PUSH_SISTEMA : STORAGE_PUSH_MODULO;

  // 2. Control anti-saturación por sesión (si no es forzado)
  if (!forzar) {
    const yaNotificado = getSessionItem(claveStorage);
    if (yaNotificado) {
      return { enviado: false, motivo: 'ya_notificado_en_sesion' };
    }
  }

  // 3. Cooldown de ráfagas entre acceso al sistema y acceso al módulo
  if (!forzar) {
    const ultimo = Number(getLocalItem(STORAGE_PUSH_ULTIMO_ENVIO) || 0);
    if (ultimo > 0 && Date.now() - ultimo < COOLDOWN_PUSH_MS) {
      return { enviado: false, motivo: 'cooldown_activo' };
    }
  }

  // 4. Verificar si la alerta roja está activa
  const alerta = await verificarAlertaRojaCombustible();

  if (!alerta.activa) {
    // Alerta inactiva: limpiamos marcas de sesión para estar listos ante futuros descensos
    limpiarMarcasSesionCombustible();
    return { enviado: false, motivo: 'alerta_inactiva', alerta };
  }

  // 5. Emitir notificación push y registrar en sistema
  try {
    // A) Web Push / Notificación nativa en dispositivo
    await emitirWebPush({
      modulo: 'combustible',
      titulo: alerta.titulo,
      cuerpo: alerta.cuerpo,
      url: '/app/combustible',
      tag: 'gt-combustible-alerta-roja',
      vibrar: true,
    });

    // B) Campana del sistema (idempotente por dedup_key)
    void pushNotif({
      destino: 'all',
      kind: 'warning',
      title: alerta.titulo,
      message: alerta.cuerpo,
      link: '#/app/combustible',
      dedup_key: 'combustible:bajo',
    }).then(() => {
      emitNotifRefresh();
    }).catch(() => { /* best-effort */ });

    // C) Marcar en sesión para evitar saturación
    setSessionItem(claveStorage, String(Date.now()));
    setLocalItem(STORAGE_PUSH_ULTIMO_ENVIO, String(Date.now()));

    return { enviado: true, alerta };
  } catch (error) {
    console.warn('Error al procesar notificación push de combustible:', error);
    return { enviado: false, motivo: 'error_push', alerta };
  }
}

/** Limpia las marcas de sesión para permitir nuevas alertas */
export function limpiarMarcasSesionCombustible(): void {
  removeSessionItem(STORAGE_PUSH_SISTEMA);
  removeSessionItem(STORAGE_PUSH_MODULO);
}
