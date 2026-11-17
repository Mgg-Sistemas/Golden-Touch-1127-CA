/* ============================================================
   Golden Touch · Pre-salidas / Borradores de almacén · Persistencia

   1) Tabla primaria `public.pre_salidas_almacen` (si está aplicada la
      migración `supabase/2026-11-17-pre-salidas-borradores.sql`).
   2) Respaldo automático en la nube SIN requerir SQL manual:
      archivos JSON versionados en `deposito-mina-salidas` bajo
      `pre-salidas/<almacenSlug>/<id>__<seq>__<estado>.json` (`upsert: false`,
      compatible con permisos SELECT + INSERT de todos los almacenistas),
      más espejo local en `localStorage` para tolerar cortes de señal.
   3) Mientras está en `borrador` o `cancelada` NUNCA toca stock ni kardex.
      Solo `confirmarPreSalida` llama `registrarSalidaMina` /
      `registrarSalidasMina`, descuenta stock y anota el movimiento oficial.
   ============================================================ */

import { supabase } from '@/shared/lib/supabase';
import { crearEntregaTelefono } from '@/modules/maquinaria/entregasAlmacen.repository';
import {
  registrarSalidaMina,
  registrarSalidasMina,
  subirFotosSalidaMina,
  subirFotosSalidasMina,
} from './salidasMina.repository';
import type { SalidaMina } from './salidasMina';
import {
  motivoSalidaDesdePreSalida,
  resolverUltimasVersionesStorage,
  slugAlmacenPreSalida,
  type EstadoPreSalida,
  type ItemPreSalida,
  type PreSalidaAlmacen,
} from './preSalidasMina';

const TABLE = 'pre_salidas_almacen';
const BUCKET = 'deposito-mina-salidas';
const LS_PREFIX = 'gt_pre_salidas_v1:';

const faltaTabla = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (
    e.code === '42P01'
    || e.code === 'PGRST205'
    || e.code === 'PGRST204'
    || /does not exist|Could not find the table/i.test(e.message ?? '')
  );

let tablaDisponible: boolean | null = null;

function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function seqMonotono(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rnd = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${ts}-${rnd}`;
}

export async function nextCodigoPreSalida(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `pre-salida-${year}` });
    if (!error && Number(data) > 0) {
      return `PRE-${year}-${String(Number(data)).padStart(4, '0')}`;
    }
  } catch { /* fallback abajo */ }
  const tail = String(Math.floor((Date.now() / 1000) % 10000)).padStart(4, '0');
  return `PRE-${year}-${tail}`;
}

function normalizarFila(r: Record<string, unknown>): PreSalidaAlmacen {
  const p = r as unknown as PreSalidaAlmacen;
  const itemsRaw = Array.isArray(r.items) ? (r.items as ItemPreSalida[]) : [];
  return {
    ...p,
    almacen: String(r.almacen ?? 'General'),
    destino_equipo: String(r.destino_equipo ?? ''),
    equipo_id: (r.equipo_id as string | null) ?? null,
    equipo_nombre: (r.equipo_nombre as string | null) ?? null,
    tipo_mantenimiento: (r.tipo_mantenimiento as string | null) ?? null,
    solicitante: String(r.solicitante ?? ''),
    motivo: (r.motivo as string | null) ?? null,
    retorna: typeof r.retorna === 'boolean' ? r.retorna : null,
    estado: (['borrador', 'procesada', 'cancelada'].includes(String(r.estado)) ? r.estado : 'borrador') as EstadoPreSalida,
    items: itemsRaw.map((it) => ({
      producto_id: String(it.producto_id ?? ''),
      producto_sku: String(it.producto_sku ?? ''),
      producto_nombre: String(it.producto_nombre ?? ''),
      unidad: String(it.unidad ?? 'und'),
      cantidad: Number(it.cantidad) || 0,
    })),
    salida_codigos: Array.isArray(r.salida_codigos) ? (r.salida_codigos as string[]) : null,
    salida_ids: Array.isArray(r.salida_ids) ? (r.salida_ids as string[]) : null,
  };
}

/* ─────────── Espejo local (respaldo ante corte de red) ─────────── */

function leerLocal(almacen: string): PreSalidaAlmacen[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(`${LS_PREFIX}${slugAlmacenPreSalida(almacen)}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => normalizarFila(x as Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

function guardarEnLocal(pre: PreSalidaAlmacen): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = `${LS_PREFIX}${slugAlmacenPreSalida(pre.almacen)}`;
    const actual = leerLocal(pre.almacen).filter((x) => x.id !== pre.id);
    const nueva = [pre, ...actual].slice(0, 80);
    localStorage.setItem(key, JSON.stringify(nueva));
  } catch { /* sin storage local */ }
}

/* ─────────── Respaldo en la nube vía Storage (sin SQL manual) ─────────── */

async function escribirVersionStorage(pre: PreSalidaAlmacen): Promise<void> {
  const carpeta = `pre-salidas/${slugAlmacenPreSalida(pre.almacen)}`;
  const path = `${carpeta}/${pre.id}__${seqMonotono()}__${pre.estado}.json`;
  const blob = new Blob([JSON.stringify(pre)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: 'application/json',
  });
  if (error) throw new Error(error.message);
}

async function listarDesdeStorage(almacen: string, incluirCerradas: boolean): Promise<PreSalidaAlmacen[]> {
  const carpeta = `pre-salidas/${slugAlmacenPreSalida(almacen)}`;
  const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, {
    limit: 500,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) throw error;
  const nombres = (data ?? []).map((f) => f.name).filter(Boolean);
  const versiones = resolverUltimasVersionesStorage(nombres, incluirCerradas).slice(0, incluirCerradas ? 60 : 50);
  const descargadas = await Promise.all(versiones.map(async (v) => {
    try {
      const res = await supabase.storage.from(BUCKET).download(`${carpeta}/${v.filename}`);
      if (res.error || !res.data) return null;
      const txt = await res.data.text();
      return normalizarFila(JSON.parse(txt) as Record<string, unknown>);
    } catch {
      return null;
    }
  }));
  return descargadas.filter((x): x is PreSalidaAlmacen => !!x);
}

function combinarConLocal(remotas: PreSalidaAlmacen[], locales: PreSalidaAlmacen[], incluirCerradas: boolean): PreSalidaAlmacen[] {
  const mapa = new Map<string, PreSalidaAlmacen>();
  for (const r of remotas) mapa.set(r.id, r);
  for (const l of locales) {
    const prev = mapa.get(l.id);
    if (!prev || (l.updated_at || '') > (prev.updated_at || '')) {
      mapa.set(l.id, l);
    }
  }
  return Array.from(mapa.values())
    .filter((x) => incluirCerradas || x.estado === 'borrador')
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
}

async function persistirPreSalida(pre: PreSalidaAlmacen, esNueva: boolean): Promise<PreSalidaAlmacen> {
  guardarEnLocal(pre);
  if (tablaDisponible !== false) {
    const q = esNueva
      ? supabase.from(TABLE).insert(pre).select('*').single()
      : supabase.from(TABLE).update(pre).eq('id', pre.id).select('*').single();
    const { data, error } = await q;
    if (!error && data) {
      tablaDisponible = true;
      const norm = normalizarFila(data as Record<string, unknown>);
      guardarEnLocal(norm);
      return norm;
    }
    if (faltaTabla(error)) {
      tablaDisponible = false;
    } else if (error) {
      throw new Error(error.message || 'No se pudo guardar la pre-salida.');
    }
  }
  await escribirVersionStorage(pre);
  return pre;
}

/* ─────────── API pública ─────────── */

export async function listPreSalidas(almacen: string, incluirCerradas = false): Promise<PreSalidaAlmacen[]> {
  const locales = leerLocal(almacen);
  if (tablaDisponible !== false) {
    let q = supabase.from(TABLE).select('*').eq('almacen', almacen).order('updated_at', { ascending: false }).limit(80);
    if (!incluirCerradas) q = q.eq('estado', 'borrador');
    const { data, error } = await q;
    if (!error) {
      tablaDisponible = true;
      const filas = ((data ?? []) as Record<string, unknown>[]).map(normalizarFila);
      filas.forEach(guardarEnLocal);
      return filas;
    }
    if (faltaTabla(error)) {
      tablaDisponible = false;
    } else {
      throw new Error(error.message || 'No se pudieron leer las pre-salidas.');
    }
  }
  try {
    const remotas = await listarDesdeStorage(almacen, incluirCerradas);
    const unidas = combinarConLocal(remotas, locales, incluirCerradas);
    unidas.forEach(guardarEnLocal);
    return unidas;
  } catch {
    return combinarConLocal([], locales, incluirCerradas);
  }
}

export interface CrearPreSalidaInput {
  almacen: string;
  destino_equipo: string;
  equipo_id?: string | null;
  equipo_nombre?: string | null;
  tipo_mantenimiento?: string | null;
  solicitante: string;
  motivo?: string | null;
  retorna?: boolean | null;
  items: ItemPreSalida[];
  actor: string;
  actor_name: string | null;
}

export async function crearPreSalida(input: CrearPreSalidaInput): Promise<PreSalidaAlmacen> {
  const ahora = new Date().toISOString();
  const codigo = await nextCodigoPreSalida();
  const pre: PreSalidaAlmacen = {
    id: nuevoId(),
    codigo,
    almacen: input.almacen,
    destino_equipo: input.destino_equipo.trim(),
    equipo_id: input.equipo_id ?? null,
    equipo_nombre: input.equipo_nombre?.trim() || null,
    tipo_mantenimiento: input.tipo_mantenimiento?.trim() || null,
    solicitante: input.solicitante.trim(),
    motivo: input.motivo?.trim() || null,
    retorna: input.retorna ?? null,
    items: input.items,
    estado: 'borrador',
    actor: input.actor,
    actor_name: input.actor_name,
    created_at: ahora,
    updated_at: ahora,
    autorizado_por: null,
    salida_codigos: null,
    salida_ids: null,
    procesada_en: null,
    procesada_por: null,
    cancelada_en: null,
    cancelada_motivo: null,
  };
  return persistirPreSalida(pre, true);
}

export async function actualizarPreSalida(
  actual: PreSalidaAlmacen,
  patch: Partial<Pick<PreSalidaAlmacen, 'destino_equipo' | 'equipo_id' | 'equipo_nombre' | 'tipo_mantenimiento' | 'solicitante' | 'motivo' | 'retorna' | 'items'>>,
): Promise<PreSalidaAlmacen> {
  if (actual.estado !== 'borrador') {
    throw new Error('Solo se pueden editar pre-salidas en estatus borrador.');
  }
  const editada: PreSalidaAlmacen = {
    ...actual,
    ...patch,
    destino_equipo: (patch.destino_equipo ?? actual.destino_equipo).trim(),
    solicitante: (patch.solicitante ?? actual.solicitante).trim(),
    motivo: (patch.motivo !== undefined ? patch.motivo : actual.motivo)?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  return persistirPreSalida(editada, false);
}

export async function cancelarPreSalida(
  actual: PreSalidaAlmacen,
  motivoCancelacion: string | null,
): Promise<PreSalidaAlmacen> {
  if (actual.estado !== 'borrador') {
    throw new Error('Esta pre-salida ya no está en borrador.');
  }
  const ahora = new Date().toISOString();
  const cancelada: PreSalidaAlmacen = {
    ...actual,
    estado: 'cancelada',
    cancelada_en: ahora,
    cancelada_motivo: motivoCancelacion?.trim() || null,
    updated_at: ahora,
  };
  return persistirPreSalida(cancelada, false);
}

export async function confirmarPreSalida(
  pre: PreSalidaAlmacen,
  opts: {
    autorizadoPor: string;
    retorna: boolean;
    fotos: File[];
    actor: string;
    actorName: string | null;
  },
): Promise<{
  salidas: SalidaMina[];
  pre: PreSalidaAlmacen;
  entregaCodigo: string | null;
  entregaFallo: string | null;
}> {
  if (pre.estado !== 'borrador') {
    throw new Error('Esta pre-salida ya fue procesada o cancelada.');
  }
  const autorizado = opts.autorizadoPor.trim();
  if (!autorizado) throw new Error('Selecciona quién autorizó la salida en WhatsApp.');
  if (!pre.items.length) throw new Error('La pre-salida no tiene materiales.');

  const motivoKardex = motivoSalidaDesdePreSalida(pre);
  let salidas: SalidaMina[];
  if (pre.items.length === 1) {
    const it = pre.items[0];
    let s = await registrarSalidaMina({
      productoId: it.producto_id,
      cantidad: it.cantidad,
      motivo: motivoKardex,
      autorizadoPor: autorizado,
      retorna: opts.retorna,
      actor: opts.actor,
      actorName: opts.actorName,
      almacen: pre.almacen,
    });
    if (opts.fotos.length) {
      try { s = await subirFotosSalidaMina(s, opts.fotos); } catch { /* la salida ya descontó stock */ }
    }
    salidas = [s];
  } else {
    salidas = await registrarSalidasMina({
      items: pre.items.map((it) => ({ productoId: it.producto_id, cantidad: it.cantidad })),
      motivo: motivoKardex,
      autorizadoPor: autorizado,
      retorna: opts.retorna,
      actor: opts.actor,
      actorName: opts.actorName,
      almacen: pre.almacen,
    });
    if (opts.fotos.length) {
      try { salidas = await subirFotosSalidasMina(salidas, opts.fotos); } catch { /* la salida ya descontó stock */ }
    }
  }

  let entregaCodigo: string | null = null;
  let entregaFallo: string | null = null;
  if (pre.equipo_id) {
    try {
      const ent = await crearEntregaTelefono({
        salidaIds: salidas.map((s) => s.id),
        equipoId: pre.equipo_id,
        tipoSugerido: pre.tipo_mantenimiento || null,
        nota: [pre.destino_equipo, pre.motivo].filter(Boolean).join(' · ') || null,
        actorName: opts.actorName,
      });
      entregaCodigo = ent.codigo;
    } catch (e) {
      entregaFallo = e instanceof Error ? e.message : 'No se pudo avisar a Maquinaria';
    }
  }

  const ahora = new Date().toISOString();
  const procesada: PreSalidaAlmacen = {
    ...pre,
    retorna: opts.retorna,
    estado: 'procesada',
    autorizado_por: autorizado,
    salida_codigos: salidas.map((s) => s.codigo),
    salida_ids: salidas.map((s) => s.id),
    procesada_en: ahora,
    procesada_por: opts.actorName ?? opts.actor,
    updated_at: ahora,
  };
  const preGuardada = await persistirPreSalida(procesada, false).catch(() => procesada);
  return { salidas, pre: preGuardada, entregaCodigo, entregaFallo };
}
