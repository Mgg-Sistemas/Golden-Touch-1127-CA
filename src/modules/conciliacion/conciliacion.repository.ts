/* ============================================================
   Conciliación · lectura de datos (12/11/2026).

   Junta lo que la lógica pura (conciliacion.ts) necesita:
     · las OC de Compras que ya tienen código de OC;
     · las COMPRAS DIRECTAS y los SERVICIOS DIRECTOS (con la factura que
       Compras carga al finalizarlos);
     · el nombre de cada proveedor;
     · los egresos de pago de cada OC (movimientos_caja, pago_oc), de donde
       salen la referencia del pago y la tasa;
     · las retenciones practicadas del libro fiscal (OC, compra y servicio directo);
     · cuántas facturas tiene cada documento (adjuntos + factura de recepción);
     · lo anotado en Conciliación: referencia (lapicito) y comprobantes de pago;
     · la tasa BCV de cada día de pago y la de hoy.

   Los pagos los deja leer la base a quien ve Tesorería (o Pedidos·base). Si el
   usuario no los puede leer, la tabla igual sale, sin referencias.
   ============================================================ */

import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import type { Orden } from '@/shared/lib/types';
import { listProveedores } from '@/modules/pedidos/pedidos.repository';
import { comprobantesDeLaOrden } from '@/modules/pedidos/adjuntosPago';
import { cuentaComoFactura, type AdjuntoDirecto, type ModuloDirecto } from '@/modules/pedidos/adjuntosDirectos.repository';
import { listRetenciones } from '@/modules/libroFiscal/retencionesFiscal.repository';
import { diaVE, getTasaHoy, getTasasUsdDeFechas } from '@/modules/tesoreria/tasas.repository';
import {
  armarFilas, claveDoc, combinarFilas, filasDirectas,
  type ArchivoNota, type ComprobanteTesoreria, type DocDirecto, type FilaConciliacion,
  type NotaConciliacion, type OrigenDoc, type PagoOc, type RetencionLibro,
} from './conciliacion';

export interface DatosConciliacion {
  filas: FilaConciliacion[];
  /** Las OC tal cual (para abrir la factura con FacturasOcModal). */
  ordenes: Map<string, Orden>;
  /** Avisos de lo que no se pudo leer (permisos o red): la tabla sale igual. */
  avisos: string[];
  /** false si falta aplicar el SQL de comprobantes/referencia de Conciliación. */
  notasDisponibles: boolean;
}

const LOTE_IDS = 150;
const TABLA_NOTAS = 'conciliacion_pagos';
const BUCKET_NOTAS = 'conciliacion-pagos';
export const MSG_FALTA_SQL_CONCILIACION =
  'Falta aplicar en Supabase el SQL 2026-11-12-conciliacion-comprobantes.sql (referencia y comprobantes de Conciliación).';

const esTablaFaltante = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''));

async function enLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) out.push(...await fn(ids.slice(i, i + LOTE_IDS)));
  return out;
}

async function pagosDeOrdenes(ids: string[]): Promise<PagoOc[]> {
  return enLotes(ids, async (lote) => {
    const { data, error } = await supabase.from('movimientos_caja')
      .select('ref_orden_id, monto, moneda, motivo, at')
      .in('ref_orden_id', lote)
      .eq('tipo', 'salida')
      .eq('categoria', 'pago_oc')
      .order('at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as { ref_orden_id: string; monto: number; moneda: string; motivo: string | null; at: string | null }[])
      .map((r) => ({ ordenId: r.ref_orden_id, monto: Number(r.monto) || 0, moneda: r.moneda ?? 'USD', motivo: r.motivo, at: r.at }));
  });
}

/** Cuántas facturas cargadas tiene cada documento (adjuntos_directos), por `claveDoc`. */
async function facturasCargadas(modulo: ModuloDirecto, origen: OrigenDoc, ids: string[]): Promise<Map<string, number>> {
  const filas = await enLotes(ids, async (lote) => {
    const { data, error } = await supabase.from('adjuntos_directos')
      .select('ref_id, modulo, es_factura')
      .eq('modulo', modulo)
      .in('ref_id', lote);
    if (error) throw error;
    return (data ?? []) as Pick<AdjuntoDirecto, 'ref_id' | 'modulo' | 'es_factura'>[];
  });
  const m = new Map<string, number>();
  for (const a of filas) {
    if (!cuentaComoFactura(a)) continue;
    const k = claveDoc(origen, String(a.ref_id));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

interface FilaNota { doc_tipo: OrigenDoc; doc_id: string; referencia: string | null; comprobantes: ArchivoNota[] | null }

async function notasConciliacion(): Promise<{ notas: Map<string, NotaConciliacion>; disponible: boolean }> {
  const { data, error } = await supabase.from(TABLA_NOTAS).select('doc_tipo, doc_id, referencia, comprobantes');
  if (error) {
    if (esTablaFaltante(error)) return { notas: new Map(), disponible: false };
    throw error;
  }
  const notas = new Map<string, NotaConciliacion>();
  for (const r of (data ?? []) as FilaNota[]) {
    notas.set(claveDoc(r.doc_tipo, r.doc_id), {
      referencia: r.referencia?.trim() || null,
      comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes : [],
    });
  }
  return { notas, disponible: true };
}

type FilaDirecta = Record<string, unknown>;

function aDocDirecto(r: FilaDirecta, origen: 'cd' | 'sd'): DocDirecto {
  const num = (k: string) => (r[k] == null ? null : Number(r[k]));
  const txt = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    id: String(r.id), origen,
    codigo: txt('codigo'),
    proveedor: txt('proveedor_nombre'),
    estado: txt('estado') ?? 'en_proceso',
    fecha: txt('created_at') ?? '',
    moneda: txt('moneda'),
    total: num('gasto'),
    tasaPago: num('tasa_pago'),
    tasaConversion: num('tasa_conversion'),
    pagadaAt: txt('pagada_at'),
    retencionPago: num('retencion_pago_monto'),
    retencionTipo: origen === 'cd' ? txt('retencion_tipo') : null,
    adjuntoPath: txt('adjunto_path'),
    adjuntoNombre: txt('adjunto_nombre'),
  };
}

async function directos(tabla: 'compras_directas' | 'servicios_directos'): Promise<FilaDirecta[]> {
  return todasLasFilas<FilaDirecta>((desde, hasta) => supabase.from(tabla)
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta) as unknown as PromiseLike<{ data: FilaDirecta[] | null; error: import('@supabase/supabase-js').PostgrestError | null }>);
}

export async function cargarConciliacion(): Promise<DatosConciliacion> {
  const avisos: string[] = [];

  // Las OC (con código de OC), de la más nueva a la más vieja.
  const ordenes = await todasLasFilas<Orden>((desde, hasta) => supabase.from('ordenes')
    .select('*')
    .not('oc_codigo', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta) as unknown as PromiseLike<{ data: Orden[] | null; error: import('@supabase/supabase-js').PostgrestError | null }>);
  const ids = ordenes.map((o) => o.id);

  const [compras, servicios] = await Promise.all([
    directos('compras_directas').catch(() => { avisos.push('No se pudieron leer las compras directas.'); return []; }),
    directos('servicios_directos').catch(() => { avisos.push('No se pudieron leer los servicios directos.'); return []; }),
  ]);
  const docs = [...compras.map((r) => aDocDirecto(r, 'cd')), ...servicios.map((r) => aDocDirecto(r, 'sd'))];
  const idsCd = docs.filter((d) => d.origen === 'cd').map((d) => d.id);
  const idsSd = docs.filter((d) => d.origen === 'sd').map((d) => d.id);

  const sinFacturas = () => { avisos.push('No se pudo contar las facturas cargadas.'); return new Map<string, number>(); };
  const [proveedores, pagos, retenciones, tasaHoy, facOc, facCd, facSd, notas] = await Promise.all([
    listProveedores().catch(() => { avisos.push('No se pudieron leer los proveedores.'); return []; }),
    pagosDeOrdenes(ids).catch(() => {
      avisos.push('No tienes acceso a los pagos de Tesorería: las referencias y la tasa del pago no se muestran.');
      return [] as PagoOc[];
    }),
    listRetenciones({ direccion: 'practicada' }).catch(() => {
      avisos.push('No se pudo leer el libro de retenciones: solo se muestran las retenciones indicadas en Compras.');
      return [];
    }),
    getTasaHoy().catch(() => null),
    facturasCargadas('orden_factura', 'oc', ids).catch(sinFacturas),
    facturasCargadas('compra', 'cd', idsCd).catch(sinFacturas),
    facturasCargadas('servicio', 'sd', idsSd).catch(sinFacturas),
    notasConciliacion().catch(() => ({ notas: new Map<string, NotaConciliacion>(), disponible: true })),
  ]);
  if (!notas.disponible) avisos.push(MSG_FALTA_SQL_CONCILIACION);

  // La factura de recepción vieja (una sola, en la OC) también cuenta.
  const facturas = new Map<string, number>([...facOc, ...facCd, ...facSd]);
  for (const o of ordenes) {
    if (o.factura_recepcion_path) facturas.set(claveDoc('oc', o.id), (facturas.get(claveDoc('oc', o.id)) ?? 0) + 1);
  }

  const libro: RetencionLibro[] = retenciones
    .filter((r) => (r.docKind === 'oc' || r.docKind === 'compra_directa' || r.docKind === 'servicio_directo') && r.docId)
    .map((r) => ({ ordenId: r.docId as string, tipo: r.tipo, comprobante: r.numeroComprobante, monto: r.montoRetenido, moneda: r.moneda ?? null }));

  const pagosPorOrden = agrupar(pagos);
  const diasPago = [
    ...ordenes.map((o) => o.pagada_en ?? pagosPorOrden.get(o.id)?.[0]?.at ?? null),
    ...docs.map((d) => d.pagadaAt),
  ].filter((x): x is string => !!x).map((iso) => diaVE(iso));
  const bcvPorDia = await getTasasUsdDeFechas(diasPago).catch(() => new Map<string, number>());

  const comprobantes = new Map<string, ComprobanteTesoreria[]>(
    ordenes.map((o) => [o.id, comprobantesDeLaOrden(o).map((c) => ({ path: c.path, nombre: c.nombre }))]),
  );
  const ctx = {
    proveedores: new Map(proveedores.map((p) => [p.id, p.razon_social])),
    pagos: pagosPorOrden,
    retenciones: agrupar(libro),
    bcvPorDia,
    bcvHoy: tasaHoy?.usd ?? null,
    dia: diaVE,
    notas: notas.notas,
    facturas,
    comprobantes,
  };
  const filas = combinarFilas(armarFilas(ordenes, ctx), filasDirectas(docs, ctx));

  return { filas, ordenes: new Map(ordenes.map((o) => [o.id, o])), avisos, notasDisponibles: notas.disponible };
}

function agrupar<T extends { ordenId: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const l = m.get(x.ordenId);
    if (l) l.push(x); else m.set(x.ordenId, [x]);
  }
  return m;
}

/* ─────────────── Lo que se anota desde Conciliación ─────────────── */

async function notaActual(origen: OrigenDoc, id: string): Promise<NotaConciliacion | null> {
  const { data, error } = await supabase.from(TABLA_NOTAS)
    .select('referencia, comprobantes').eq('doc_tipo', origen).eq('doc_id', id).maybeSingle();
  if (error) {
    if (esTablaFaltante(error)) throw new Error(MSG_FALTA_SQL_CONCILIACION);
    throw error;
  }
  if (!data) return null;
  const r = data as { referencia: string | null; comprobantes: ArchivoNota[] | null };
  return { referencia: r.referencia, comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes : [] };
}

async function guardarNota(origen: OrigenDoc, id: string, cambios: Partial<NotaConciliacion>, actor: { email: string; nombre?: string | null }) {
  const { error } = await supabase.from(TABLA_NOTAS).upsert({
    doc_tipo: origen, doc_id: id, ...cambios,
    actualizado_por: actor.email, actualizado_por_nombre: actor.nombre ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'doc_tipo,doc_id' });
  if (error) {
    if (esTablaFaltante(error)) throw new Error(MSG_FALTA_SQL_CONCILIACION);
    if (error.code === '42501') throw new Error('No tienes permiso de escritura en Conciliación o Tesorería.');
    throw error;
  }
}

/** Referencia del pago anotada en Conciliación (vacía = se borra). */
export async function guardarReferenciaConciliacion(
  origen: OrigenDoc, id: string, referencia: string, actor: { email: string; nombre?: string | null },
): Promise<void> {
  const ref = referencia.trim().slice(0, 60);
  await guardarNota(origen, id, { referencia: ref || null }, actor);
}

/** Sube comprobantes del pago desde Conciliación (PDF o imagen, máx. 10 MB c/u). */
export async function subirComprobantesConciliacion(
  origen: OrigenDoc, id: string, files: File[], actor: { email: string; nombre?: string | null },
): Promise<ArchivoNota[]> {
  for (const f of files) {
    if (f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/')) throw new Error(`«${f.name}» no es PDF ni imagen.`);
    if (f.size > 10 * 1024 * 1024) throw new Error(`«${f.name}» supera los 10 MB.`);
  }
  const previa = await notaActual(origen, id);
  const nuevos: ArchivoNota[] = [];
  for (const f of files) {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const path = `${origen}/${id}/${stamp}-${f.name.replace(/[^\w.-]+/g, '_')}`;
    const { error } = await supabase.storage.from(BUCKET_NOTAS).upload(path, f, { upsert: false, contentType: f.type || 'application/pdf' });
    if (error) {
      if (/bucket not found/i.test(error.message)) throw new Error(MSG_FALTA_SQL_CONCILIACION);
      throw error;
    }
    nuevos.push({ path, nombre: f.name, at: new Date().toISOString(), por: actor.nombre || actor.email });
  }
  const lista = [...(previa?.comprobantes ?? []), ...nuevos];
  try {
    await guardarNota(origen, id, { comprobantes: lista }, actor);
  } catch (e) {
    await supabase.storage.from(BUCKET_NOTAS).remove(nuevos.map((n) => n.path)).catch(() => { /* se limpia después */ });
    throw e;
  }
  return lista;
}

/** Quita un comprobante cargado desde Conciliación (los de Tesorería no se tocan). */
export async function quitarComprobanteConciliacion(
  origen: OrigenDoc, id: string, path: string, actor: { email: string; nombre?: string | null },
): Promise<ArchivoNota[]> {
  const previa = await notaActual(origen, id);
  const lista = (previa?.comprobantes ?? []).filter((c) => c.path !== path);
  await guardarNota(origen, id, { comprobantes: lista }, actor);
  await supabase.storage.from(BUCKET_NOTAS).remove([path]).catch(() => { /* el registro ya no está */ });
  return lista;
}

export async function urlComprobanteConciliacion(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_NOTAS).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
