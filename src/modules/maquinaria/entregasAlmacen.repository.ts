/* ============================================================
   Entregas del almacén para mantenimiento · acceso a datos (12/11/2026).
   Todo cambio pasa por RPC (la base valida quién puede qué):
     entrega_mantenimiento_crear      → almacenista (teléfono) / quien ejecuta la salida (PC)
     entrega_mantenimiento_registrar  → Maquinaria: queda en la bitácora
     entrega_mantenimiento_rechazar   → Maquinaria: vuelve al almacén como devolución
     entrega_mantenimiento_dar_entrada→ almacenista: entra al inventario
   Mientras la migración 2026-11-12-entregas-almacen-mantenimiento.sql no esté
   aplicada, las lecturas devuelven vacío (la pantalla no se rompe).
   ============================================================ */

import { supabase } from '@/shared/lib/supabase';
import type { EntregaAlmacen, FotoArchivo } from './entregasAlmacen';

const TABLA = 'maquinaria_entregas_almacen';
/** Las fotos del mantenimiento van al bucket de fotos de Maquinaria, carpeta bitacora/. */
export const BUCKET_FOTOS_BITACORA = 'maquinaria-os-fotos';
const BUCKET_FOTOS_SALIDA = 'deposito-mina-salidas';
export const MAX_FOTOS_MANTENIMIENTO = 8;

function faltaMigracion(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883'
    || /does not exist|could not find/i.test(e.message ?? '');
}

export const MSG_FALTA_MIGRACION =
  'Falta aplicar en Supabase la migración 2026-11-12-entregas-almacen-mantenimiento.sql (entregas del almacén a Maquinaria).';

function aEntrega(r: Record<string, unknown>): EntregaAlmacen {
  return {
    ...(r as unknown as EntregaAlmacen),
    items: Array.isArray(r.items) ? (r.items as EntregaAlmacen['items']).map((i) => ({ ...i, cantidad: Number(i.cantidad) || 0 })) : [],
    fotos: Array.isArray(r.fotos) ? (r.fotos as FotoArchivo[]) : [],
    salida_ids: Array.isArray(r.salida_ids) ? (r.salida_ids as string[]) : [],
  };
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) {
    if (faltaMigracion(error)) throw new Error(MSG_FALTA_MIGRACION);
    throw error;
  }
  return data as T;
}

/* ─────────── Crear (almacén) ─────────── */

export async function crearEntregaTelefono(input: {
  salidaIds: string[]; equipoId: string; nota?: string | null; tipoSugerido?: string | null; actorName?: string | null;
}): Promise<EntregaAlmacen> {
  const r = await rpc<Record<string, unknown>>('entrega_mantenimiento_crear', {
    p: {
      origen: 'telefono', salida_ids: input.salidaIds, equipo_id: input.equipoId,
      nota: input.nota ?? null, tipo_sugerido: input.tipoSugerido ?? null, actor_name: input.actorName ?? null,
    },
  });
  return aEntrega(r);
}

export async function crearEntregaPc(input: {
  solicitudSalidaId: string; equipoId: string; nota?: string | null; actorName?: string | null;
}): Promise<EntregaAlmacen> {
  const r = await rpc<Record<string, unknown>>('entrega_mantenimiento_crear', {
    p: {
      origen: 'pc', solicitud_salida_id: input.solicitudSalidaId, equipo_id: input.equipoId,
      nota: input.nota ?? null, actor_name: input.actorName ?? null,
    },
  });
  return aEntrega(r);
}

/* ─────────── Listas ─────────── */

async function filas(consulta: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<EntregaAlmacen[]> {
  const { data, error } = await consulta;
  if (error) {
    if (faltaMigracion(error)) return [];
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(aEntrega);
}

/** Pendientes de registrar en Maquinaria (más viejas primero: se atienden en orden). */
export function listEntregasPendientes(): Promise<EntregaAlmacen[]> {
  return filas(supabase.from(TABLA).select('*').eq('estado', 'pendiente').order('created_at', { ascending: true }));
}

/** Historial de entregas (las últimas). */
export function listEntregasRecientes(limite = 100): Promise<EntregaAlmacen[]> {
  return filas(supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(limite));
}

/** Una entrega por id (para el detalle de un registro de la bitácora). */
export async function getEntrega(id: string): Promise<EntregaAlmacen | null> {
  const xs = await filas(supabase.from(TABLA).select('*').eq('id', id).limit(1));
  return xs[0] ?? null;
}

/** Devoluciones (rechazadas por Maquinaria) que el almacén todavía no recibió. */
export function listDevolucionesPendientes(origen?: 'telefono' | 'pc'): Promise<EntregaAlmacen[]> {
  let q = supabase.from(TABLA).select('*').eq('estado', 'rechazada').eq('devolucion_estado', 'pendiente')
    .order('atendida_en', { ascending: true });
  if (origen) q = q.eq('origen', origen);
  return filas(q);
}

/* ─────────── Maquinaria: registrar / rechazar ─────────── */

export interface DatosRegistroEntrega {
  equipoId?: string | null;
  fecha: string;
  tipos: string[];
  horometro: number | null;
  kilometraje: number | null;
  aceiteLts: number | null;
  refrigeranteLts: number | null;
  trabajo: string | null;
  mecanico: string | null;
  ubicacion: string | null;
  observacion: string | null;
  fotos: FotoArchivo[];
  actorName: string | null;
}

export async function registrarEntrega(id: string, d: DatosRegistroEntrega): Promise<EntregaAlmacen> {
  const r = await rpc<Record<string, unknown>>('entrega_mantenimiento_registrar', {
    p_id: id,
    p: {
      equipo_id: d.equipoId ?? null, fecha: d.fecha, tipos: d.tipos,
      horometro: d.horometro, kilometraje: d.kilometraje, aceite_lts: d.aceiteLts, refrigerante_lts: d.refrigeranteLts,
      trabajo: d.trabajo, mecanico: d.mecanico, ubicacion: d.ubicacion, observacion: d.observacion,
      fotos: d.fotos, actor_name: d.actorName,
    },
  });
  return aEntrega(r);
}

export async function rechazarEntrega(id: string, motivo: string, actorName: string | null): Promise<EntregaAlmacen> {
  const r = await rpc<Record<string, unknown>>('entrega_mantenimiento_rechazar', { p_id: id, p_motivo: motivo, p_actor_name: actorName });
  return aEntrega(r);
}

/* ─────────── Almacén: recibir la devolución ─────────── */

export async function darEntradaDevolucion(id: string, nota: string | null, actorName: string | null): Promise<EntregaAlmacen> {
  const r = await rpc<Record<string, unknown>>('entrega_mantenimiento_dar_entrada', { p_id: id, p_nota: nota, p_actor_name: actorName });
  return aEntrega(r);
}

/* ─────────── Fotos ─────────── */

const seguro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

/** Sube las fotos del mantenimiento. Devuelve [{path, filename}] para guardar en la bitácora. */
export async function subirFotosMantenimiento(equipoId: string, archivos: File[]): Promise<FotoArchivo[]> {
  const carpeta = `bitacora/${equipoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const out: FotoArchivo[] = [];
  for (const [i, f] of archivos.slice(0, MAX_FOTOS_MANTENIMIENTO).entries()) {
    const path = `${carpeta}/${i + 1}-${seguro(f.name || 'foto.jpg')}`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS_BITACORA).upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (error) throw new Error(`No se pudo subir la foto «${f.name}»: ${error.message}`);
    out.push({ path, filename: f.name || `foto-${i + 1}.jpg` });
  }
  return out;
}

async function firmar(bucket: string, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 30);
  if (error) return {};
  const out: Record<string, string> = {};
  (data ?? []).forEach((d, i) => { if (d.signedUrl) out[paths[i]] = d.signedUrl; });
  return out;
}

/** URL firmadas (30 min) de las fotos de un mantenimiento. */
export function urlsFotosMantenimiento(fotos: FotoArchivo[]): Promise<Record<string, string>> {
  return firmar(BUCKET_FOTOS_BITACORA, fotos.map((f) => f.path));
}

/** URL firmadas (30 min) de las fotos de la salida del almacén. */
export function urlsFotosSalida(fotos: FotoArchivo[]): Promise<Record<string, string>> {
  return firmar(BUCKET_FOTOS_SALIDA, fotos.map((f) => f.path));
}
