/* ============================================================
   Golden Touch · Libro de retenciones e impuestos (Supabase)

   Golden Touch NO es agente de retención. Lo que pasa de verdad es que sus
   CLIENTES le retienen (IVA, ISLR, municipal) y le entregan el comprobante, y
   que al pagar en divisas le cobran el IGTF. Ese papel vale plata: la retención
   sufrida es un ANTICIPO DE IMPUESTO que se descuenta en la declaración, y el
   que no se registra se pierde.

   Por eso el libro arranca en «sufrida» y deja «practicada» para el caso
   excepcional (una ordenanza municipal, o el ISLR sobre un servicio). El
   correlativo AAAAMM + 8 dígitos solo se genera para las practicadas: en una
   sufrida el número lo trae el comprobante del cliente.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import {
  enBolivares, normalizarRif, numeroComprobante, periodoFiscal, quincena, resumirLibro,
  type ConceptoIslr, type ResumenLibro, type RolRetencion, type SujetoRetenido, type TipoRetencion,
} from './calculosRetenciones';

export { resumirLibro };
export type { ResumenLibro };

const TABLE = 'retenciones';
const BUCKET = 'compras-oc';

const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/* ───────── Parámetros fiscales ───────── */

export interface ParametrosFiscales {
  empresa_rif: string;
  empresa_nombre: string;
  agente_direccion: string;
  contribuyente_especial: boolean;
  iva_alicuota: number;
  iva_retencion: number;
  igtf_alicuota: number;
  municipal_alicuota: number;
  municipio: string;
  estadal_alicuota: number;
  unidad_tributaria: number;
}

const PARAMETROS_POR_DEFECTO: ParametrosFiscales = {
  empresa_rif: 'J-50129993-5',
  empresa_nombre: 'GOLDEN TOUCH 1127 C.A.',
  agente_direccion: '',
  contribuyente_especial: false,
  iva_alicuota: 16,
  iva_retencion: 75,
  igtf_alicuota: 3,
  municipal_alicuota: 1,
  municipio: 'Caroní',
  estadal_alicuota: 1,
  unidad_tributaria: 9,
};

export async function getParametrosFiscales(): Promise<ParametrosFiscales> {
  const { data, error } = await supabase.from('config').select('value').eq('key', 'retenciones.parametros').maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as Partial<ParametrosFiscales> & { agente_rif?: string; agente_nombre?: string };
  return {
    ...PARAMETROS_POR_DEFECTO,
    ...v,
    // La clave se llamaba `agente_*` cuando se creyó que GT retenía. Se sigue
    // leyendo para no perder lo ya cargado.
    empresa_rif: v.empresa_rif || v.agente_rif || PARAMETROS_POR_DEFECTO.empresa_rif,
    empresa_nombre: v.empresa_nombre || v.agente_nombre || PARAMETROS_POR_DEFECTO.empresa_nombre,
  };
}

export async function guardarParametrosFiscales(p: ParametrosFiscales): Promise<void> {
  const { error } = await supabase.from('config')
    .upsert({ key: 'retenciones.parametros', value: p as unknown as Record<string, unknown> }, { onConflict: 'key' });
  if (error) throw error;
}

/* ───────── Catálogo de conceptos de ISLR ───────── */

export async function listConceptosIslr(): Promise<ConceptoIslr[]> {
  const { data, error } = await supabase.from('retenciones_conceptos')
    .select('codigo, concepto, pjd, pjnd, pnr, pnnr, base_pct')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return (data ?? []) as ConceptoIslr[];
}

/* ───────── El libro ───────── */

export type EstadoRetencion = 'registrada' | 'declarada' | 'anulada';

export interface RetencionLibro {
  id: string;
  rol: RolRetencion;
  tipo: TipoRetencion;
  estado: EstadoRetencion;
  fecha: string;
  numero: number | null;
  comprobante_nro: string | null;
  comprobante_periodo: string | null;
  quincena: number | null;
  /** La otra parte: quien retuvo (sufrida) o a quien se le retuvo (practicada). */
  proveedor_id: string | null;
  rif: string | null;
  razon_social: string | null;
  sujeto: SujetoRetenido | null;
  factura_nro: string | null;
  factura_control: string | null;
  factura_fecha: string | null;
  factura_total: number | null;
  base: number;
  exento: number | null;
  iva_alicuota: number | null;
  iva_monto: number | null;
  porcentaje: number;
  motivo: string | null;
  concepto_codigo: string | null;
  concepto: string | null;
  sustraendo: number | null;
  municipio: string | null;
  monto: number;
  moneda: string;
  tasa: number | null;
  base_bs: number | null;
  monto_bs: number | null;
  descripcion: string | null;
  orden_id: string | null;
  compra_directa_id: string | null;
  servicio_directo_id: string | null;
  comprobante_path: string | null;
  comprobante_nombre: string | null;
  declarada_at: string | null;
  declarada_por: string | null;
  anulada_motivo: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface FiltrosLibro {
  rol?: RolRetencion | '';
  tipo?: TipoRetencion | '';
  estado?: EstadoRetencion | '';
  desde?: string;
  hasta?: string;
}

/** El libro completo del período, sin el tope de 1.000 filas de PostgREST. */
export async function listLibro(f: FiltrosLibro = {}): Promise<RetencionLibro[]> {
  return todasLasFilas<RetencionLibro>((a, b) => {
    let q = supabase.from(TABLE).select('*');
    if (f.rol) q = q.eq('rol', f.rol);
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.estado) q = q.eq('estado', f.estado);
    if (f.desde) q = q.gte('fecha', f.desde);
    if (f.hasta) q = q.lte('fecha', f.hasta);
    return q.order('fecha', { ascending: false }).order('created_at', { ascending: false }).range(a, b);
  });
}

/* ───────── Registrar ───────── */

export interface NuevaRetencion {
  rol: RolRetencion;
  tipo: TipoRetencion;
  fecha: string;
  /** La contraparte. En una sufrida es el CLIENTE que retuvo. */
  proveedorId?: string | null;
  rif?: string | null;
  razonSocial?: string | null;
  sujeto?: SujetoRetenido | null;
  /** Número del comprobante del cliente. En las practicadas se genera solo. */
  comprobanteNro?: string | null;
  facturaNro?: string | null;
  facturaControl?: string | null;
  facturaFecha?: string | null;
  facturaTotal?: number | null;
  base: number;
  exento?: number | null;
  ivaAlicuota?: number | null;
  ivaMonto?: number | null;
  porcentaje: number;
  motivo?: string | null;
  conceptoCodigo?: string | null;
  concepto?: string | null;
  sustraendo?: number | null;
  municipio?: string | null;
  monto: number;
  moneda: string;
  tasa?: number | null;
  descripcion?: string | null;
  ordenId?: string | null;
  compraDirectaId?: string | null;
  servicioDirectoId?: string | null;
  archivo?: File | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Registra una retención en el libro. Si la practica la empresa, el correlativo
 * y el número de comprobante los da la base (`siguiente_numero_retencion`), que
 * es lo único que garantiza que dos usuarios no saquen el mismo número.
 */
export async function registrarRetencion(input: NuevaRetencion): Promise<RetencionLibro> {
  const fecha = (input.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const periodo = periodoFiscal(fecha);
  const monto = r2(input.monto);
  if (monto <= 0) throw new Error('La retención no puede quedar en cero.');

  let numero: number | null = null;
  let comprobante = input.comprobanteNro?.trim() || null;
  if (input.rol === 'practicada') {
    const { data, error } = await supabase.rpc('siguiente_numero_retencion', { p_tipo: input.tipo, p_periodo: periodo });
    if (error) throw error;
    numero = Number(data) || null;
    if (numero) comprobante = numeroComprobante(fecha, numero);
  }

  const moneda = input.moneda || 'Bs';
  const tasa = Number(input.tasa) || null;
  const fila: Record<string, unknown> = {
    rol: input.rol, tipo: input.tipo, estado: 'registrada', fecha,
    numero, comprobante_nro: comprobante, comprobante_periodo: periodo, quincena: quincena(fecha),
    proveedor_id: input.proveedorId || null,
    rif: input.rif ? normalizarRif(input.rif) : null,
    razon_social: input.razonSocial?.trim() || null,
    sujeto: input.sujeto ?? null,
    factura_nro: input.facturaNro?.trim() || null,
    factura_control: input.facturaControl?.trim() || null,
    factura_fecha: input.facturaFecha || null,
    factura_total: input.facturaTotal ?? null,
    base: r2(input.base),
    exento: input.exento ?? null,
    iva_alicuota: input.ivaAlicuota ?? null,
    iva_monto: input.ivaMonto ?? null,
    porcentaje: Number(input.porcentaje) || 0,
    motivo: input.motivo?.trim() || null,
    concepto_codigo: input.conceptoCodigo || null,
    concepto: input.concepto?.trim() || null,
    sustraendo: input.sustraendo ?? null,
    municipio: input.municipio?.trim() || null,
    monto, moneda, tasa,
    base_bs: enBolivares(r2(input.base), moneda, tasa ?? 0) || null,
    monto_bs: enBolivares(monto, moneda, tasa ?? 0) || null,
    descripcion: input.descripcion?.trim() || null,
    orden_id: input.ordenId || null,
    compra_directa_id: input.compraDirectaId || null,
    servicio_directo_id: input.servicioDirectoId || null,
    actor: input.actor, actor_name: input.actorName ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from(TABLE).insert(fila).select('*').single();
  if (error) throw error;
  const creada = data as RetencionLibro;

  // El comprobante escaneado va después: si falla la subida, la retención ya
  // quedó registrada y se puede adjuntar más tarde.
  if (input.archivo) {
    try { await adjuntarComprobante(creada.id, input.archivo); } catch { /* se adjunta luego */ }
  }
  return creada;
}

/** Sube el comprobante (PDF o imagen) y lo enlaza a la retención. */
export async function adjuntarComprobante(id: string, file: File): Promise<void> {
  if (file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
    throw new Error('El comprobante debe ser PDF o imagen.');
  }
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `retenciones/${id}/${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true, contentType: file.type || 'application/pdf',
  });
  if (error) throw error;
  const { error: e2 } = await supabase.from(TABLE)
    .update({ comprobante_path: path, comprobante_nombre: file.name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e2) throw e2;
}

/** URL firmada (10 minutos) para ver el comprobante guardado. */
export async function urlComprobante(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Marca como DECLARADAS las retenciones de una quincena. Es el paso que cierra
 * el período: lo declarado ya no se toca.
 */
export async function marcarDeclaradas(ids: string[], actor: string): Promise<number> {
  const limpio = ids.filter(Boolean);
  if (!limpio.length) return 0;
  const { data, error } = await supabase.from(TABLE)
    .update({ estado: 'declarada', declarada_at: new Date().toISOString(), declarada_por: actor, updated_at: new Date().toISOString() })
    .in('id', limpio).eq('estado', 'registrada').select('id');
  if (error) throw error;
  return (data ?? []).length;
}

/**
 * Anula una retención. No se borra: una retención declarada y después borrada
 * deja un hueco en el correlativo que después nadie sabe explicar.
 */
export async function anularRetencion(id: string, motivo: string, actor: string): Promise<void> {
  const m = motivo.trim();
  if (!m) throw new Error('Indicá por qué se anula: queda en el libro como constancia.');
  const { error } = await supabase.from(TABLE).update({
    estado: 'anulada', anulada_motivo: m, actor, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

/** Vuelve a «registrada» una retención anulada por error. */
export async function reactivarRetencion(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({
    estado: 'registrada', anulada_motivo: null, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('estado', 'anulada');
  if (error) throw error;
}

