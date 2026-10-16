/* ============================================================
   Golden Touch · Libro fiscal · Registro por factura (v8 · VF)

   Una FACTURA (cabecera) con varias LÍNEAS de impuesto. El registro es
   atómico: la base crea la cabecera y las líneas en una sola transacción con
   `retencion_factura_registrar`, y devuelve todo con sus números ya asignados
   (V2). Si algo falla, no se gasta ningún número ni queda cabecera huérfana.

   Esta capa traduce el modelo del módulo (dirección, impuesto en minúsculas,
   sujeto, documento de origen) a los NOMBRES DE COLUMNA de GT que la función
   espera. Depende del paquete de base VF (y V2 para la numeración): el código
   queda listo y se enchufa cuando estén aplicados.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { normalizarRif } from '@/shared/lib/rif';
import type { DireccionRetencion, SujetoRetenido, TipoImpuesto } from './retencionesCalculo';
import {
  aRetencion, rolAGt, sujetoAGt, tipoAGt, type DocKind, type RetencionPracticada,
} from './retencionesFiscal.repository';
import { errorRetencion } from './erroresRetencion';

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const texto = (v: unknown) => (v == null || v === '' ? null : String(v));

/* ───────── El modelo del front ───────── */

export interface LineaFacturaNueva {
  tipo: TipoImpuesto;
  base: number;
  porcentaje: number;
  monto: number;
  sustraendo?: number | null;
  ivaAlicuota?: number | null;
  ivaMonto?: number | null;
  moneda?: string;
  tasa?: number | null;
  baseBs?: number | null;
  montoBs?: number | null;
  /** El supuesto del 100 % del IVA. */
  motivo?: string | null;
  conceptoCodigo?: string | null;
  conceptoNombre?: string | null;
  municipio?: string | null;
  /** Observación; OBLIGATORIA si el monto es 0 (D19); la valida la base. */
  descripcion?: string | null;
  /** El número editado (mixta) o el del cliente en una recibida. */
  comprobanteNro?: string | null;
  comprobantePeriodo?: string | null;
  quincena?: 1 | 2 | null;
  fecha?: string | null;
}

export interface FacturaNueva {
  direccion: DireccionRetencion;
  docKind: DocKind;
  docId?: string | null;
  /** Solo un proveedor: en una recibida la contraparte es un cliente (no lleva proveedor_id). */
  contraparteId?: string | null;
  contraparteRif?: string | null;
  contraparteNombre?: string | null;
  contraparteSujeto?: SujetoRetenido | null;
  facturaNro?: string | null;
  facturaControl?: string | null;
  facturaFecha?: string | null;
  facturaTotal?: number | null;
  exento?: number | null;
  ivaAlicuota?: number | null;
  ivaMonto?: number | null;
  moneda?: string;
  tasa?: number | null;
  operacion?: 'servicio' | 'mercancia' | null;
  concepto?: string | null;
  nota?: string | null;
  periodo?: string;
  actor: string;
  actorName?: string | null;
}

/* ───────── Traducción al contrato de la función (columnas de GT) ───────── */

/** p_factura: la cabecera con los nombres de columna de GT. */
export function pFacturaDe(f: FacturaNueva): Record<string, unknown> {
  return {
    rol: rolAGt(f.direccion),
    // En una recibida la contraparte es un cliente: no cabe en la FK a proveedores.
    proveedor_id: f.direccion === 'practicada' ? f.contraparteId ?? null : null,
    rif: f.contraparteRif ? normalizarRif(f.contraparteRif) : null,
    razon_social: f.contraparteNombre?.trim() || null,
    sujeto: sujetoAGt(f.contraparteSujeto),
    factura_nro: f.facturaNro?.trim() || null,
    factura_control: f.facturaControl?.trim() || null,
    factura_fecha: f.facturaFecha || null,
    factura_total: f.facturaTotal ?? null,
    exento: f.exento ?? null,
    iva_alicuota: f.ivaAlicuota ?? null,
    iva_monto: f.ivaMonto ?? null,
    moneda: f.moneda || 'Bs',
    tasa: f.tasa ?? null,
    doc_kind: f.docKind,
    doc_id: f.docKind === 'manual' ? null : f.docId ?? null,
    operacion: f.operacion ?? null,
    concepto: f.concepto?.trim() || null,
    nota: f.nota?.trim() || null,
    periodo: f.periodo || null,
    actor: f.actor,
    actor_name: f.actorName ?? null,
  };
}

/** p_lineas[]: cada línea de impuesto con los nombres de columna de GT. */
export function pLineaDe(l: LineaFacturaNueva): Record<string, unknown> {
  return {
    tipo: tipoAGt(l.tipo),
    base: r2(n(l.base)),
    porcentaje: n(l.porcentaje),
    monto: r2(n(l.monto)),
    sustraendo: l.sustraendo ?? null,
    base_bs: l.baseBs ?? null,
    monto_bs: l.montoBs ?? null,
    iva_alicuota: l.ivaAlicuota ?? null,
    iva_monto: l.ivaMonto ?? null,
    moneda: l.moneda ?? null,
    tasa: l.tasa ?? null,
    motivo: l.motivo?.trim() || null,
    concepto_codigo: l.conceptoCodigo ?? null,
    concepto: l.conceptoNombre?.trim() || null,
    municipio: l.municipio?.trim() || null,
    descripcion: l.descripcion?.trim() || null,
    comprobante_nro: l.comprobanteNro?.trim() || null,
    comprobante_periodo: l.comprobantePeriodo ?? null,
    quincena: l.quincena ?? null,
    fecha: l.fecha ?? null,
  };
}

/* ───────── El registro atómico ───────── */

export interface FacturaCabecera {
  id: string;
  direccion: DireccionRetencion;
  docKind: DocKind;
  docId: string | null;
  contraparteRif: string | null;
  contraparteNombre: string | null;
  facturaNro: string | null;
  facturaFecha: string | null;
  facturaTotal: number | null;
  moneda: string;
  periodo: string | null;
  nota: string | null;
  createdAt: string;
}

export interface FacturaConLineas {
  factura: FacturaCabecera;
  lineas: RetencionPracticada[];
}

/** Una fila de retencion_facturas → la cabecera del módulo. */
export function aFacturaCabecera(r: Record<string, unknown>): FacturaCabecera {
  return {
    id: String(r.id),
    direccion: r.rol === 'practicada' ? 'practicada' : 'recibida',
    docKind: r.orden_id ? 'oc' : r.compra_directa_id ? 'compra_directa' : r.servicio_directo_id ? 'servicio_directo' : 'manual',
    docId: texto(r.orden_id ?? r.compra_directa_id ?? r.servicio_directo_id),
    contraparteRif: texto(r.rif),
    contraparteNombre: texto(r.razon_social),
    facturaNro: texto(r.factura_nro),
    facturaFecha: texto(r.factura_fecha),
    facturaTotal: r.factura_total == null ? null : n(r.factura_total),
    moneda: String(r.moneda ?? 'Bs'),
    periodo: texto(r.periodo ?? r.comprobante_periodo),
    nota: texto(r.nota),
    createdAt: String(r.created_at ?? ''),
  };
}

/** Traduce los errores de la función a un texto para la pantalla (códigos RET_* en erroresRetencion). */
function errorLegibleFactura(e: { code?: string; message?: string }): Error {
  return errorRetencion(e, 'No se pudo registrar la factura.');
}

/**
 * Registra una factura con sus líneas en una sola transacción. La base asigna
 * los números (V2) y los devuelve. Todo o nada.
 */
export async function registrarFactura(factura: FacturaNueva, lineas: LineaFacturaNueva[]): Promise<FacturaConLineas> {
  if (!lineas.length) throw new Error('La factura necesita al menos una línea de impuesto.');
  const { data, error } = await supabase.rpc('retencion_factura_registrar', {
    p_factura: pFacturaDe(factura),
    p_lineas: lineas.map(pLineaDe),
  });
  if (error) throw errorLegibleFactura(error);
  const res = (data ?? {}) as { factura?: Record<string, unknown>; lineas?: Record<string, unknown>[] };
  if (!res.factura) throw new Error('La base no devolvió la factura registrada.');
  return {
    factura: aFacturaCabecera(res.factura),
    lineas: (res.lineas ?? []).map((l) => aRetencion(l)),
  };
}

/* ───────── Lectura: cabecera + líneas ───────── */

export interface FiltroFacturas {
  direccion?: DireccionRetencion;
  periodo?: string;
  desde?: string;
  hasta?: string;
  docId?: string;
}

/** Las facturas con sus líneas. PostgREST anida por la FK retenciones.factura_id. */
export async function listFacturas(f: FiltroFacturas = {}): Promise<FacturaConLineas[]> {
  let q = supabase.from('retencion_facturas').select('*, retenciones(*)')
    .order('factura_fecha', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (f.direccion) q = q.eq('rol', rolAGt(f.direccion));
  if (f.periodo) q = q.eq('periodo', f.periodo);
  if (f.desde) q = q.gte('factura_fecha', f.desde);
  if (f.hasta) q = q.lte('factura_fecha', f.hasta);
  if (f.docId) q = q.or(`orden_id.eq.${f.docId},compra_directa_id.eq.${f.docId},servicio_directo_id.eq.${f.docId}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const lineas = (r.retenciones as Record<string, unknown>[] | undefined) ?? [];
    return { factura: aFacturaCabecera(r), lineas: lineas.map((l) => aRetencion(l)) };
  });
}

/** Cambia los datos de una factura (la base los copia a sus líneas). Con líneas declaradas, solo la nota. */
export async function actualizarFactura(id: string, cambios: Partial<Pick<FacturaNueva, 'contraparteRif' | 'contraparteNombre' | 'facturaNro' | 'facturaControl' | 'facturaFecha' | 'facturaTotal' | 'nota'>>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if ('contraparteRif' in cambios) patch.rif = cambios.contraparteRif ? normalizarRif(cambios.contraparteRif) : null;
  if ('contraparteNombre' in cambios) patch.razon_social = cambios.contraparteNombre?.trim() || null;
  if ('facturaNro' in cambios) patch.factura_nro = cambios.facturaNro?.trim() || null;
  if ('facturaControl' in cambios) patch.factura_control = cambios.facturaControl?.trim() || null;
  if ('facturaFecha' in cambios) patch.factura_fecha = cambios.facturaFecha || null;
  if ('facturaTotal' in cambios) patch.factura_total = cambios.facturaTotal ?? null;
  if ('nota' in cambios) patch.nota = cambios.nota?.trim() || null;
  const { data, error } = await supabase.from('retencion_facturas').update(patch).eq('id', id).select('id');
  if (error) throw errorLegibleFactura(error);
  if (!data?.length) throw new Error('No se guardó el cambio de la factura: sin permiso, o la factura ya no existe.');
}
