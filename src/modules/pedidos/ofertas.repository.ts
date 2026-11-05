import { supabase } from '@/shared/lib/supabase';
import type { AdjuntoOferta, FichaOferta, ItemOrden, OfertaProveedor, Producto } from '@/shared/lib/types';
import { aplicarPlan, claveNombreFicha, planFichas, renglonesBase, type ConSkuOrden, type EleccionNombreInventario, type FichaMin } from './nombreInventario';
import { createProducto, nextSku } from '@/modules/inventario/inventario.repository';
import { asegurarCategoria } from '@/modules/inventario/CategoriaProductoSelect';
import { ALMACEN_MINA } from '@/modules/inventario/depositos';

const TABLE = 'ofertas_proveedor';
const BUCKET = 'ofertas-pdf';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** El adjunto de una oferta puede ser PDF o imagen (foto de la cotización). */
function esAdjuntoValido(file: File): boolean {
  return file.type === 'application/pdf' || file.type.startsWith('image/');
}

export interface CrearOfertaInput {
  orden_id: string;
  proveedor_id: string;
  actividad_economica?: string | null;
  items: ItemOrden[];
  precio_total: number;
  /** Precio con descuento en divisa (opcional). Si se indica, pasa a ser el precio final de la OC. */
  precio_divisa?: number | null;
  /** Descuento obtenido (monto $) que se resta del total de la factura/OC. Opcional. */
  descuento_obtenido?: number | null;
  /** Impuestos de la factura del proveedor (se SUMAN al total de la OC y se arrastran a
   *  Tesorería). Por % o por monto manual. */
  iva_pct?: number | null;
  iva_monto?: number | null;
  iva_aplicado?: boolean | null;
  /** 05/11/2026: los precios cotizados ya traen el IVA (se guarda, no suma). */
  iva_incluido?: boolean | null;
  igtf_pct?: number | null;
  igtf_monto?: number | null;
  igtf_aplicado?: boolean | null;
  fecha_entrega_prometida?: string | null;
  condiciones_pago?: string | null;  // 'contra_entrega' | 'anticipado' | 'credito'
  /** Anticipo (adelanto parcial) cuando condiciones_pago='anticipado' en órdenes de servicio.
   *  Al aceptar la oferta se aplica: no toca caja, se resta del total y el resto queda a crédito. */
  anticipo_monto?: number | null;
  anticipo_moneda?: string | null;
  notas?: string | null;
  registrada_por_email: string;
  pdf_path?: string | null;
  pdf_filename?: string | null;
  /** Adjuntos (PDF o imágenes) de la cotización. */
  adjuntos?: AdjuntoOferta[] | null;
  /** Ficha del producto ofertado + costos logísticos. */
  ficha?: FichaOferta | null;
}

/** Producto ACTIVO fuera del Depósito Mina que se llama igual (sin acentos ni mayúsculas), o null. */
async function productoActivoPorNombre(nombre: string): Promise<Producto | null> {
  const patron = nombre.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from('productos').select('*')
    .eq('estado', 'activo').neq('almacen', ALMACEN_MINA)
    .ilike('nombre', patron).limit(5);
  if (error) throw error;
  const k = claveNombreFicha(nombre);
  return ((data ?? []) as Producto[]).find((p) => claveNombreFicha(p.nombre) === k) ?? null;
}

/**
 * «Se guarda en inventario como» (03/11/2026, de MGG): antes de guardar la cotización,
 * cada renglón queda ligado al producto del inventario con que va a entrar al recibir.
 *  · El que eligió un producto existente toma su id, SKU, nombre y unidad.
 *  · El que necesita un producto nuevo lo crea UNA vez (Inventario General, stock 0, SKU
 *    correlativo de su categoría); si en la base ya hay uno activo que se llama igual
 *    (alguien lo creó mientras tanto), se usa ese.
 * Nunca renombra un producto existente. `elecciones` va por el sku que el renglón tiene
 * ahora (las variantes de marca siguen a su renglón base).
 */
export async function ligarRenglonesAInventario<T extends ItemOrden>(
  items: T[],
  elecciones: Record<string, EleccionNombreInventario | undefined>,
  catalogo: FichaMin[],
  actorEmail: string,
): Promise<{ items: ConSkuOrden<T>[]; creadas: Producto[] }> {
  const plan = planFichas(renglonesBase(items).map((item) => ({ item, eleccion: elecciones[item.sku] })), catalogo);
  if (plan.error) throw new Error(plan.error);
  const fichaPorSku = new Map<string, FichaMin>();
  for (const [sku, d] of plan.destinos) if (d.tipo === 'ficha') fichaPorSku.set(sku, d.ficha);
  const creadas: Producto[] = [];
  for (const c of plan.crear) {
    let ficha = await productoActivoPorNombre(c.nombre);
    if (!ficha) {
      const categoria = await asegurarCategoria(c.categoria, actorEmail);
      const sku = await nextSku(categoria);
      ficha = await createProducto({
        sku, nombre: c.nombre, categoria, unidad: c.unidad,
        stock: 0, stock_min: 0, precio: 0, almacen: 'General', estado: 'activo',
      });
      creadas.push(ficha);
    }
    for (const sku of c.skus) fichaPorSku.set(sku, ficha);
  }
  return { items: aplicarPlan(items, fichaPorSku), creadas };
}

/** Etiquetas legibles de las condiciones de pago. */
export const CONDICIONES_PAGO: { value: string; label: string }[] = [
  { value: 'contado', label: 'Pago de Contado' },
  { value: 'contra_entrega', label: 'Pago Contra Entrega' },
  { value: 'anticipado', label: 'Pago Anticipado' },
  { value: 'credito', label: 'Pago a Crédito' },
];
export function labelCondicionPago(v?: string | null): string {
  return CONDICIONES_PAGO.find((c) => c.value === v)?.label ?? '—';
}

/** Sube la cotización (PDF o imagen) al bucket `ofertas-pdf` y retorna su path. */
export async function subirPdfOferta(
  ordenId: string,
  proveedorId: string,
  file: File,
): Promise<{ path: string; filename: string }> {
  if (!esAdjuntoValido(file)) throw new Error('El archivo debe ser PDF o imagen');
  if (file.size > MAX_PDF_BYTES) throw new Error('El archivo no puede superar 10 MB');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
  const path = `${ordenId}/${proveedorId}-${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
  if (error) throw error;
  return { path, filename: file.name };
}

/** Sube varios adjuntos (PDF o imágenes) de una oferta y devuelve sus paths. */
export async function subirAdjuntosOferta(
  ordenId: string,
  proveedorId: string,
  files: File[],
): Promise<AdjuntoOferta[]> {
  const out: AdjuntoOferta[] = [];
  for (const file of files) {
    out.push(await subirPdfOferta(ordenId, proveedorId, file));
  }
  return out;
}

/** Genera un signed URL de 5 min para descargar un PDF de oferta. */
export async function getPdfOfertaSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error('No se pudo generar enlace');
  return data.signedUrl;
}

export async function listOfertasByOrden(orden_id: string): Promise<OfertaProveedor[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('orden_id', orden_id)
    .order('precio_total', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OfertaProveedor[];
}

export async function crearOferta(input: CrearOfertaInput): Promise<OfertaProveedor> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      orden_id: input.orden_id,
      proveedor_id: input.proveedor_id,
      actividad_economica: input.actividad_economica ?? null,
      items: input.items,
      precio_total: input.precio_total,
      precio_divisa: input.precio_divisa ?? null,
      descuento_obtenido: Math.max(0, Number(input.descuento_obtenido) || 0),
      iva_pct: Math.max(0, Number(input.iva_pct) || 0),
      iva_monto: Math.max(0, Number(input.iva_monto) || 0),
      iva_aplicado: !!input.iva_aplicado,
      iva_incluido: !!input.iva_aplicado && !!input.iva_incluido,
      igtf_pct: Math.max(0, Number(input.igtf_pct) || 0),
      igtf_monto: Math.max(0, Number(input.igtf_monto) || 0),
      igtf_aplicado: !!input.igtf_aplicado,
      fecha_entrega_prometida: input.fecha_entrega_prometida ?? null,
      condiciones_pago: input.condiciones_pago ?? null,
      anticipo_monto: input.condiciones_pago === 'anticipado' && Number(input.anticipo_monto) > 0 ? Math.round(Number(input.anticipo_monto) * 100) / 100 : null,
      anticipo_moneda: input.condiciones_pago === 'anticipado' && Number(input.anticipo_monto) > 0 ? (input.anticipo_moneda === 'Bs' ? 'Bs' : 'USD') : null,
      notas: input.notas ?? null,
      registrada_por_email: input.registrada_por_email,
      pdf_path: input.pdf_path ?? null,
      pdf_filename: input.pdf_filename ?? null,
      adjuntos: input.adjuntos ?? [],
      ficha: input.ficha ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as OfertaProveedor;
}

export async function actualizarOferta(
  id: string,
  patch: Partial<Pick<CrearOfertaInput,
    'proveedor_id' | 'actividad_economica' | 'items' | 'precio_total' | 'precio_divisa' | 'descuento_obtenido' |
    'iva_pct' | 'iva_monto' | 'iva_aplicado' | 'iva_incluido' | 'igtf_pct' | 'igtf_monto' | 'igtf_aplicado' |
    'fecha_entrega_prometida' | 'condiciones_pago' | 'anticipo_monto' | 'anticipo_moneda' |
    'notas' | 'ficha' | 'adjuntos' | 'pdf_path' | 'pdf_filename'>>
): Promise<OfertaProveedor> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const oferta = data as OfertaProveedor;
  // Fuente única del impuesto: si la oferta ya está ACEPTADA y su OC todavía NO pasó por
  // el método de pago (estado aprobada/oc_aprobada), re-sincronizamos IVA/IGTF a la orden
  // para que el total a pagar refleje el impuesto aunque se edite DESPUÉS de aceptar.
  // (Una vez con método de pago, el impuesto lo maneja Tesorería y no se pisa.)
  if (oferta.estado === 'aceptada') {
    await sincronizarImpuestosOrdenDesdeOferta(oferta).catch(() => { /* no bloquear la edición */ });
  }
  return oferta;
}

/** Re-sincroniza IVA/IGTF de la OC con los de su oferta aceptada (fuente única),
 *  ajustando el total. Solo en estados PRE-pago; nunca pisa lo que fijó Tesorería. */
async function sincronizarImpuestosOrdenDesdeOferta(oferta: OfertaProveedor): Promise<void> {
  const { data } = await supabase
    .from('ordenes')
    .select('id, estado, total, total_divisa, iva_aplicado, iva_monto, iva_incluido, igtf_aplicado, igtf_monto')
    .eq('id', oferta.orden_id)
    .maybeSingle();
  if (!data) return;
  const o = data as {
    id: string; estado: string; total: number | null; total_divisa: number | null;
    iva_aplicado: boolean | null; iva_monto: number | null; iva_incluido: boolean | null; igtf_aplicado: boolean | null; igtf_monto: number | null;
  };
  // Nunca tocar una OC ya pagada/cerrada (el monto es histórico).
  if (['pagada', 'recibida', 'finalizada'].includes(o.estado)) return;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ivaAp = !!oferta.iva_aplicado, igtfAp = !!oferta.igtf_aplicado;
  // Solo sincronizamos cuando la OFERTA trae impuestos (fuente única): así se agregan/
  // ajustan a la OC. Si la oferta NO tiene impuestos, no tocamos la OC (respeta un IVA
  // que Tesorería pudiera haber cargado en el método de pago).
  if (!ivaAp && !igtfAp) return;
  const ivaM = ivaAp ? Math.max(0, num(oferta.iva_monto)) : 0;
  const igtfM = igtfAp ? Math.max(0, num(oferta.igtf_monto)) : 0;
  // 05/11/2026: el IVA que ya viene en los precios no suma (ni se resta).
  const incl = ivaAp && !!oferta.iva_incluido;
  const prevImp = (o.iva_aplicado && !o.iva_incluido ? num(o.iva_monto) : 0) + (o.igtf_aplicado ? num(o.igtf_monto) : 0);
  const newImp = (incl ? 0 : ivaM) + igtfM;
  if (r2(prevImp) === r2(newImp) && !!o.iva_aplicado === ivaAp && !!o.igtf_aplicado === igtfAp
    && !!o.iva_incluido === incl && r2(num(o.iva_monto)) === r2(ivaM)) return; // sin cambios
  const patch: Record<string, unknown> = {
    iva_aplicado: ivaAp, iva_pct: ivaAp ? num(oferta.iva_pct) : 0, iva_monto: ivaAp ? ivaM : null, iva_incluido: incl,
    igtf_aplicado: igtfAp, igtf_pct: igtfAp ? num(oferta.igtf_pct) : 0, igtf_monto: igtfAp ? igtfM : null,
    total: r2(num(o.total) - prevImp + newImp),
  };
  if (o.total_divisa != null) patch.total_divisa = r2(num(o.total_divisa) - prevImp + newImp);
  await supabase.from('ordenes').update(patch).eq('id', o.id);
}

export async function eliminarOferta(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Acepta una oferta:
 *  - marca esta oferta como `aceptada`,
 *  - marca las demás de la misma orden como `descartada`,
 *  - retorna la oferta aceptada actualizada.
 * No actualiza la orden — eso lo hace el caller (`pedidos.repository.aprobarOrdenConOferta`).
 */
export async function aceptarOferta(
  ofertaId: string,
  decididaPorEmail: string,
  scoreCalculado?: number | null
): Promise<OfertaProveedor> {
  const { data: oferta, error: fetchErr } = await supabase
    .from(TABLE)
    .select('orden_id')
    .eq('id', ofertaId)
    .single();
  if (fetchErr || !oferta) throw fetchErr ?? new Error('Oferta no encontrada');

  // Descartar todas las hermanas que no sean esta.
  const { error: discardErr } = await supabase
    .from(TABLE)
    .update({
      estado: 'descartada',
      decidida_por_email: decididaPorEmail,
      decidida_en: new Date().toISOString(),
    })
    .eq('orden_id', oferta.orden_id)
    .neq('id', ofertaId)
    .eq('estado', 'pendiente');
  if (discardErr) throw discardErr;

  // Aceptar la elegida.
  const { data: accepted, error: acceptErr } = await supabase
    .from(TABLE)
    .update({
      estado: 'aceptada',
      decidida_por_email: decididaPorEmail,
      decidida_en: new Date().toISOString(),
      score_calculado: scoreCalculado ?? null,
    })
    .eq('id', ofertaId)
    .select('*')
    .single();
  if (acceptErr) throw acceptErr;
  return accepted as OfertaProveedor;
}

export async function descartarOferta(
  id: string,
  decididaPorEmail: string,
  motivo: string
): Promise<OfertaProveedor> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      estado: 'descartada',
      motivo_descarte: motivo,
      decidida_por_email: decididaPorEmail,
      decidida_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as OfertaProveedor;
}
