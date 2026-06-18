import { supabase } from '@/shared/lib/supabase';
import { pagarOrden } from '@/modules/tesoreria/tesoreria.repository';
import { egresarDivisa } from '@/modules/tesoreria/cajaSaldos.repository';
import { guardarDatosPago, requiereDatos, type DatosPago } from './datosPago.repository';
import type {
  AbonoCredito,
  CuentaCaja,
  EstadoOrden,
  EventoHistorial,
  ItemOrden,
  Orden,
  PagoMetodo,
  Producto,
  Proveedor,
  Usuario,
} from '@/shared/lib/types';

/** Bucket de Storage para los adjuntos de pago de OC (factura / retención). */
const BUCKET_OC = 'compras-oc';

/* ============================================================
   Golden Touch · Pedidos (Órdenes) · Repository
   Portado del demo `src-full/modules/ordenes/ordenes.controller.*`
   a Supabase. La lógica de negocio (estados, historial, etc.)
   se mantiene en el cliente para preservar la cronología y los
   guards del demo; la persistencia es directa contra `ordenes`.
   ============================================================ */

const TABLE = 'ordenes';

export async function listOrdenes(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

export async function getOrdenById(id: string): Promise<Orden | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Orden | null;
}

export async function listProveedoresActivos(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .eq('estado', 'activo')
    .order('razon_social', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Proveedor[];
}

/** Todos los proveedores (activos e inactivos). Para resolver nombres en las
 *  órdenes aunque el proveedor haya quedado inactivo. */
export async function listProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('razon_social', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Proveedor[];
}

export async function listProductosActivos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('estado', 'activo')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Producto[];
}

/** Lee el rol del usuario actual desde la tabla `usuarios`. */
export async function getCurrentUsuario(): Promise<Usuario | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as Usuario | null;
}

/** Genera el siguiente código OP-YYYY-#### contando órdenes existentes. */
export async function nextCodigo(): Promise<string> {
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  const n = (count ?? 0) + 1;
  return `OP-${year}-${String(n).padStart(4, '0')}`;
}

export interface CrearOrdenInput {
  proveedor_id: string | null;
  items: ItemOrden[];
  notas?: string | null;
  motivo?: string | null;
  finalidad?: string | null;
  clasificacion?: string[] | null;
  solicitante_email: string;
  solicitante: string | null;
  unidad_solicitante?: string | null;
  ci_solicitante: string | null;
  /** OP marcada como urgente por el solicitante. */
  urgente?: boolean | null;
  /** Imagen adjunta a la OP (path en bucket `op-imagenes`). */
  imagen_path?: string | null;
}

export async function crearOrden(input: CrearOrdenInput): Promise<Orden> {
  const codigo = await nextCodigo();
  const total = input.items.reduce((a, i) => a + i.cantidad * i.precio, 0);
  const historial: EventoHistorial[] = [
    {
      at: new Date().toISOString(),
      evento: 'creada',
      actor: input.solicitante_email,
    },
  ];
  const row = {
    codigo,
    proveedor_id: input.proveedor_id,
    solicitante_email: input.solicitante_email,
    solicitante: input.solicitante,
    unidad_solicitante: input.unidad_solicitante ?? null,
    ci_solicitante: input.ci_solicitante,
    items: input.items,
    total,
    estado: 'pendiente' as EstadoOrden,
    notas: input.notas ?? null,
    motivo: input.motivo?.trim() || null,
    finalidad: input.finalidad?.trim() || null,
    clasificacion: input.clasificacion?.length ? input.clasificacion : null,
    urgente: input.urgente ?? false,
    imagen_path: input.imagen_path ?? null,
    historial,
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single();
  if (error) throw error;
  return data as Orden;
}

/* ── Imagen adjunta a la OP (bucket privado `op-imagenes`) ── */
const OP_IMG_BUCKET = 'op-imagenes';
const MAX_OP_IMG_BYTES = 10 * 1024 * 1024;

/** Sube una imagen para la OP y devuelve su path en el bucket. */
export async function subirImagenOrden(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
  if (file.size > MAX_OP_IMG_BYTES) throw new Error('La imagen no puede superar 10 MB');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
  const path = `${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(OP_IMG_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

/** Genera un signed URL (5 min) para ver la imagen de una OP. */
export async function getImagenOrdenSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(OP_IMG_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error('No se pudo generar enlace');
  return data.signedUrl;
}

/**
 * Marca/desmarca qué ítems se compran en una OP (etapa sin oferta/precio).
 * Permite que en una OP con 4 productos se aprueben solo algunos: los marcados
 * (`comprar !== false`) son los que luego se cotizan/compran.
 */
export async function actualizarComprarItems(
  o: Orden,
  comprarPorSku: Record<string, boolean>,
  actorEmail: string,
): Promise<Orden> {
  if (Number(o.total) > 0) throw new Error('La OP ya tiene oferta con precio: no se pueden cambiar los ítems a comprar.');
  const items = o.items.map((it) =>
    Object.prototype.hasOwnProperty.call(comprarPorSku, it.sku)
      ? { ...it, comprar: comprarPorSku[it.sku] }
      : it,
  );
  const { data, error } = await supabase
    .from(TABLE)
    .update({ items, historial: appendHistorial(o, 'items_actualizados', actorEmail) })
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/** Estados en los que la orden todavía se puede editar: TODO el trámite antes de
 *  que el Gerente General apruebe la OC (firma). A partir de `oc_aprobada` se congela. */
const ESTADOS_EDITABLES_ORDEN: EstadoOrden[] = ['pendiente', 'aprobada', 'oc_creada', 'confirmada_metodo'];

/**
 * Modifica una orden mientras NO la haya aprobado el Gerente General. Permite cambiar
 * los ítems (cantidades, agregar/quitar, comprar), el motivo y la finalidad en cualquier
 * etapa previa a la firma del GG. Una vez aprobada la OC, queda congelada.
 */
export async function actualizarOrdenEditable(
  o: Orden,
  patch: {
    items?: ItemOrden[]; motivo?: string | null; finalidad?: string | null;
    unidad_solicitante?: string | null; clasificacion?: string[] | null; urgente?: boolean;
  },
  actorEmail: string,
): Promise<Orden> {
  if (o.oc_aprobada_en || o.oc_aprobada_por || o.estado === 'oc_aprobada') {
    throw new Error('La OC ya fue aprobada por el Gerente General: no se puede modificar.');
  }
  if (!ESTADOS_EDITABLES_ORDEN.includes(o.estado)) {
    throw new Error('Solo se puede modificar la orden antes de que el Gerente General apruebe la OC.');
  }
  if (patch.items && !patch.items.length) throw new Error('La OC debe tener al menos un ítem.');
  if (patch.items && !patch.items.some((i) => i.comprar !== false)) {
    throw new Error('Marcá al menos un ítem a comprar.');
  }
  const upd: Record<string, unknown> = { historial: appendHistorial(o, 'orden_modificada', actorEmail) };
  if (patch.items) upd.items = patch.items;
  if (patch.motivo !== undefined) upd.motivo = patch.motivo;
  if (patch.finalidad !== undefined) upd.finalidad = patch.finalidad;
  if (patch.unidad_solicitante !== undefined) upd.unidad_solicitante = patch.unidad_solicitante?.trim() || null;
  if (patch.clasificacion !== undefined) upd.clasificacion = patch.clasificacion?.length ? patch.clasificacion : null;
  if (patch.urgente !== undefined) upd.urgente = patch.urgente;
  const { data, error } = await supabase
    .from(TABLE)
    .update(upd)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

function appendHistorial(
  o: Orden,
  evento: string,
  actor: string,
  extra: Record<string, unknown> = {}
): EventoHistorial[] {
  const entry: EventoHistorial = {
    at: new Date().toISOString(),
    evento,
    actor,
    ...extra,
  };
  return [...(o.historial ?? []), entry];
}

/** Órdenes en estado `pendiente` (esperando aprobación), más antiguas primero. */
export async function listOrdenesPendientes(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

/** Aprueba EN LOTE varias OP pendientes (pendiente → aprobada). Devuelve cuántas. */
export async function aprobarOrdenesEnLote(ordenes: Orden[], actorEmail: string): Promise<number> {
  const elegibles = ordenes.filter((o) => o.estado === 'pendiente');
  if (!elegibles.length) throw new Error('No hay órdenes pendientes por aprobar.');
  const nowIso = new Date().toISOString();
  for (const o of elegibles) {
    const patch = {
      estado: 'aprobada' as EstadoOrden,
      aprobada_por: actorEmail,
      aprobada_en: nowIso,
      historial: appendHistorial(o, 'aprobada', actorEmail),
    };
    const { error } = await supabase.from(TABLE).update(patch).eq('id', o.id);
    if (error) throw error;
  }
  return elegibles.length;
}

export async function aprobarOrden(o: Orden, actorEmail: string): Promise<Orden> {
  if (o.estado !== 'pendiente') throw new Error('Solo se aprueban órdenes pendientes');
  const patch = {
    estado: 'aprobada' as EstadoOrden,
    aprobada_por: actorEmail,
    aprobada_en: new Date().toISOString(),
    historial: appendHistorial(o, 'aprobada', actorEmail),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/**
 * Elige la oferta ganadora sobre una OP ya APROBADA → crea la Orden de Compra
 * (estado `oc_creada`, "sin confirmar"). Casa el proveedor, hereda items/total
 * de la oferta, genera el código OC y deja registro en el historial.
 * (Mantiene el nombre `aprobarOrdenConOferta` por compatibilidad con la UI.)
 */
/**
 * Escala los precios unitarios de los ítems para que su suma cuadre con el total
 * con descuento (precio en divisa). Así "el precio final" queda vinculado en TODA
 * la OC: ítems, total, Tesorería, trazabilidad y costo de inventario al recibir.
 */
function escalarItemsADescuento(items: ItemOrden[], totalBase: number, totalDescuento: number): ItemOrden[] {
  if (!(totalBase > 0) || !(totalDescuento > 0) || totalBase === totalDescuento) return items;
  const factor = totalDescuento / totalBase;
  return items.map((it) => ({ ...it, precio: Math.round((Number(it.precio) || 0) * factor * 10000) / 10000 }));
}

export async function aprobarOrdenConOferta(
  o: Orden,
  ofertaProveedorId: string,
  ofertaItems: ItemOrden[],
  ofertaPrecioTotal: number,
  scoreCalculado: number | null,
  actorEmail: string
): Promise<Orden> {
  if (!['aprobada', 'desistida_proveedor'].includes(o.estado))
    throw new Error('Solo se crea la OC sobre órdenes de pedido aprobadas');
  const ocCodigo = o.oc_codigo ?? (await nextOcCodigo());
  const nowIso = new Date().toISOString();
  // Copiamos las condiciones de pago de la oferta elegida a la orden.
  // OJO: `ofertaProveedorId` es el id del PROVEEDOR (se guarda en proveedor_id),
  // no el id de la oferta; por eso la oferta se busca por orden + proveedor.
  const { data: ofRow } = await supabase
    .from('ofertas_proveedor').select('condiciones_pago, precio_divisa')
    .eq('orden_id', o.id).eq('proveedor_id', ofertaProveedorId)
    .order('registrada_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Si la oferta trae precio con descuento (divisa), ESE pasa a ser el precio final
  // de la OC: se fija como total, se escalan los ítems para que cuadren y la OC queda
  // marcada como pago en divisa desde la creación (se refleja en toda la OC y la trazabilidad).
  const precioDivisa = (ofRow?.precio_divisa as number | null) ?? null;
  const usaDescuento = precioDivisa != null && precioDivisa > 0 && precioDivisa !== ofertaPrecioTotal;
  const itemsFinal = usaDescuento ? escalarItemsADescuento(ofertaItems, ofertaPrecioTotal, precioDivisa) : ofertaItems;
  const totalFinal = usaDescuento ? precioDivisa : ofertaPrecioTotal;
  const patch = {
    estado: 'oc_creada' as EstadoOrden,
    proveedor_id: ofertaProveedorId,
    items: itemsFinal,
    total: totalFinal,
    total_divisa: precioDivisa,
    pago_en_divisa: usaDescuento,
    oc_codigo: ocCodigo,
    condiciones_pago: (ofRow?.condiciones_pago as string | null) ?? null,
    oc_creada_por: actorEmail,
    oc_creada_en: nowIso,
    historial: appendHistorial(o, 'oc_creada', actorEmail, {
      proveedorId: ofertaProveedorId,
      precio: totalFinal,
      precio_bcv: ofertaPrecioTotal,
      con_descuento: usaDescuento,
      score: scoreCalculado,
      oc_codigo: ocCodigo,
    }),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/** Un grupo del reparto: los ítems (ya con precio de la oferta de ese proveedor)
 *  que se le compran a UN proveedor, con su total BCV y total en divisa. */
export interface GrupoReparto {
  proveedorId: string;
  items: ItemOrden[];
  total: number;
  totalDivisa?: number | null;
  condicionesPago?: string | null;
}

/**
 * Reparte una OP aprobada entre VARIOS proveedores: por cada grupo crea una OC HIJA
 * (estado `oc_creada`) con sus ítems y precios, ligada a la OP madre (`op_padre_id`).
 * La OP madre queda `reasignada` (ya repartida). Cada OC hija sigue el flujo normal
 * (aprobación del GG, método de pago por proveedor, Tesorería, PDF). Las ofertas de
 * los proveedores elegidos quedan `aceptada`; el resto, `descartada`.
 */
export async function repartirOpEntreProveedores(
  op: Orden,
  grupos: GrupoReparto[],
  actorEmail: string,
): Promise<Orden[]> {
  if (!['aprobada', 'desistida_proveedor'].includes(op.estado))
    throw new Error('Solo se reparte una orden de pedido aprobada.');
  const validos = grupos.filter((g) => g.proveedorId && g.items.length);
  if (!validos.length) throw new Error('Asigná al menos un ítem a un proveedor.');
  const nowIso = new Date().toISOString();
  const hijos: Orden[] = [];

  for (let i = 0; i < validos.length; i++) {
    const g = validos[i];
    const ocCodigo = await nextOcCodigo();
    // Mismo criterio que la aceptación simple: si el grupo tiene precio con descuento
    // (divisa), ese es el total final de la OC hija y se escalan sus ítems.
    const gDivisa = g.totalDivisa != null ? Number(g.totalDivisa) : null;
    const gUsaDescuento = gDivisa != null && gDivisa > 0 && gDivisa !== g.total;
    const gItems = gUsaDescuento ? escalarItemsADescuento(g.items, g.total, gDivisa) : g.items;
    const gTotal = gUsaDescuento ? gDivisa : g.total;
    const row = {
      codigo: `${op.codigo}-${i + 1}`,
      proveedor_id: g.proveedorId,
      solicitante_email: op.solicitante_email,
      solicitante: op.solicitante ?? null,
      unidad_solicitante: op.unidad_solicitante ?? null,
      ci_solicitante: op.ci_solicitante ?? null,
      items: gItems,
      total: gTotal,
      total_divisa: gDivisa,
      pago_en_divisa: gUsaDescuento,
      estado: 'oc_creada' as EstadoOrden,
      notas: op.notas ?? null,
      motivo: op.motivo ?? null,
      finalidad: op.finalidad ?? null,
      clasificacion: op.clasificacion?.length ? op.clasificacion : null,
      urgente: op.urgente ?? false,
      imagen_path: op.imagen_path ?? null,
      oc_codigo: ocCodigo,
      condiciones_pago: g.condicionesPago ?? null,
      op_padre_id: op.id,
      aprobada_por: op.aprobada_por ?? null,
      aprobada_en: op.aprobada_en ?? null,
      oc_creada_por: actorEmail,
      oc_creada_en: nowIso,
      historial: [
        ...(op.historial ?? []),
        { at: nowIso, evento: 'oc_creada_reparto', actor: actorEmail, proveedorId: g.proveedorId, oc_codigo: ocCodigo, total: gTotal, con_descuento: gUsaDescuento } as EventoHistorial,
      ],
    };
    const { data, error } = await supabase.from(TABLE).insert(row).select('*').single();
    if (error) throw error;
    hijos.push(data as Orden);
  }

  // OP madre: queda repartida (ya no avanza por sí misma).
  await supabase.from(TABLE).update({
    estado: 'reasignada' as EstadoOrden,
    historial: [
      ...(op.historial ?? []),
      { at: nowIso, evento: 'op_repartida', actor: actorEmail, hijos: hijos.map((h) => h.oc_codigo) } as unknown as EventoHistorial,
    ],
    updated_at: nowIso,
  }).eq('id', op.id);

  // Ofertas: aceptar las de los proveedores elegidos; descartar el resto.
  const provIds = validos.map((g) => g.proveedorId);
  await supabase.from('ofertas_proveedor')
    .update({ estado: 'aceptada', decidida_por_email: actorEmail, decidida_en: nowIso })
    .eq('orden_id', op.id).in('proveedor_id', provIds).eq('estado', 'pendiente');
  const { data: sobrantes } = await supabase.from('ofertas_proveedor')
    .select('id, proveedor_id').eq('orden_id', op.id).eq('estado', 'pendiente');
  const descartar = (sobrantes ?? []).filter((r) => !provIds.includes((r as { proveedor_id: string }).proveedor_id)).map((r) => (r as { id: string }).id);
  if (descartar.length) {
    await supabase.from('ofertas_proveedor')
      .update({ estado: 'descartada', decidida_por_email: actorEmail, decidida_en: nowIso })
      .in('id', descartar);
  }
  return hijos;
}

/**
 * Estado destino de una OC al confirmarla el gerente, según su condición de pago:
 *  · contra_entrega → 'por_recibir'   (recibe primero, luego paga lo recibido)
 *  · credito        → 'cuenta_abierta' (abonos hasta saldar)
 *  · contado/anticipado/null → 'confirmada_metodo' (flujo actual: indicar método → Tesorería paga)
 */
export function destinoPorCondicion(cond?: string | null): EstadoOrden {
  if (cond === 'contra_entrega') return 'por_recibir';
  if (cond === 'credito') return 'cuenta_abierta';
  return 'confirmada_metodo';
}

/**
 * Aprueba/confirma EN LOTE varias OCs creadas (checklist). Cada OC pasa de
 * `oc_creada` al estado que corresponde a su condición de pago (ver
 * `destinoPorCondicion`): anticipado→Tesorería, contra_entrega→recepción,
 * crédito→cuenta abierta. Un lote con condiciones mixtas reparte cada orden.
 */
export async function aprobarOcsEnLote(
  ordenes: Orden[],
  actorEmail: string,
  almacenDestino?: string | null,
): Promise<number> {
  const elegibles = ordenes.filter((o) => o.estado === 'oc_creada');
  if (!elegibles.length) throw new Error('No hay órdenes de compra por confirmar.');
  const destino = almacenDestino?.trim() || null;
  const nowIso = new Date().toISOString();
  for (const o of elegibles) {
    const nuevoEstado = destinoPorCondicion(o.condiciones_pago);
    const patch = {
      estado: nuevoEstado,
      oc_aprobada_por: actorEmail,
      oc_aprobada_en: nowIso,
      // Si se indicó destino, lo guardamos; si no, conservamos el que ya tuviera la orden.
      ...(destino ? { almacen_destino: destino } : {}),
      historial: appendHistorial(o, `confirmada_${nuevoEstado}`, actorEmail, { oc_codigo: o.oc_codigo, almacen_destino: destino, condicion: o.condiciones_pago }),
    };
    const { error } = await supabase.from(TABLE).update(patch).eq('id', o.id);
    if (error) throw error;
  }
  return elegibles.length;
}

/**
 * Indica el método de pago de una OC confirmada (multipago) y la ENVÍA A PAGAR:
 * `confirmada_metodo` → `oc_aprobada` (Confirmada pagar). Aparece en Tesorería.
 */
/** Catálogo de métodos de pago. `sinComprobante` = no exige comprobante (efectivo). */
export const METODOS_PAGO: { value: string; label: string; sinComprobante?: boolean }[] = [
  { value: 'divisas_efectivo', label: 'Divisas en efectivo', sinComprobante: true },
  { value: 'efectivo_bs', label: 'Efectivo (Bs)', sinComprobante: true },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pago_movil', label: 'Pago móvil' },
  { value: 'binance_usdt', label: 'Binance / USDT' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'otro', label: 'Otro' },
];
export function labelMetodoPago(v?: string | null): string {
  return METODOS_PAGO.find((m) => m.value === v)?.label ?? (v ?? '—');
}
/** true si TODAS las patas son en efectivo (no requieren comprobante). */
export function pagoSinComprobante(metodos?: PagoMetodo[] | null): boolean {
  const list = metodos ?? [];
  if (!list.length) return false;
  return list.every((m) => METODOS_PAGO.find((x) => x.value === m.metodo)?.sinComprobante);
}

export async function indicarMetodoPago(
  o: Orden,
  metodos: PagoMetodo[],
  actorEmail: string,
  soporte?: { comprobanteTipo: 'nota_entrega' | 'factura'; retencionModo?: 'se_paga_despues' | 'completo_reembolso' | null; conIva?: boolean },
): Promise<Orden> {
  // Flujo normal: confirmada_metodo → oc_aprobada. Contra entrega: tras recibir
  // (recibida) se indica el método para pagar SOLO lo recibido → oc_aprobada.
  const esContraEntregaRecibida = o.estado === 'recibida' && o.condiciones_pago === 'contra_entrega';
  if (o.estado !== 'confirmada_metodo' && !esContraEntregaRecibida)
    throw new Error('La OC debe estar en "Confirmada (indicar método de pago)".');
  // El monto lo define Tesorería al pagar; acá solo se registran método(s), moneda(s)
  // y los datos del proveedor para pagarle (pago móvil / transferencia / zelle / binance).
  const limpios = (metodos ?? [])
    .map((m) => ({
      metodo: m.metodo,
      moneda: m.moneda,
      monto: Math.round((Number(m.monto) || 0) * 100) / 100,
      ...(m.datos && Object.keys(m.datos).length ? { datos: m.datos } : {}),
    }))
    .filter((m) => m.metodo && m.moneda);
  if (!limpios.length) throw new Error('Indicá al menos un método de pago.');
  // Soporte: Nota de entrega → directo a Tesorería (como hoy). Factura → además
  // entra a Retenciones (se marca el tipo y el modo de retención). En ambos casos
  // la OC queda "Confirmada pagar" (oc_aprobada) para que Tesorería pague.
  const comprobanteTipo = soporte?.comprobanteTipo ?? null;
  const retencionModo = comprobanteTipo === 'factura' ? (soporte?.retencionModo ?? null) : null;
  // Pago en divisa/efectivo: si el proveedor ofreció un precio menor en divisa
  // (`total_divisa`) y se paga con un método/moneda en divisa, el monto a pagar (y la
  // cuenta por pagar en Tesorería) usa ese precio con descuento, no el general (BCV).
  const METODOS_DIVISA = ['divisas_efectivo', 'binance_usdt', 'zelle'];
  const totalDivisa = Number(o.total_divisa) || 0;
  const pagaEnDivisa = totalDivisa > 0 && limpios.some(
    (m) => m.moneda === 'USD' || m.moneda === 'USDT' || METODOS_DIVISA.includes(m.metodo),
  );
  // OC por factura con IVA: se suma el 16% al total. Sin IVA: no agrega nada.
  const aplicaIva = comprobanteTipo === 'factura' && !!soporte?.conIva;
  const baseTotal = pagaEnDivisa ? totalDivisa : (Number(o.total) || 0);
  const ivaMonto = aplicaIva ? Math.round(baseTotal * 0.16 * 100) / 100 : 0;
  const patch = {
    estado: 'oc_aprobada' as EstadoOrden,
    metodo_pago: limpios,
    metodo_pago_por: actorEmail,
    metodo_pago_en: new Date().toISOString(),
    comprobante_tipo: comprobanteTipo,
    retencion_modo: retencionModo,
    iva_aplicado: aplicaIva,
    iva_monto: aplicaIva ? ivaMonto : null,
    pago_en_divisa: pagaEnDivisa,
    // Al pagar en divisa, el `total` de la OC pasa a ser el monto con descuento (+IVA si aplica).
    ...(pagaEnDivisa || aplicaIva ? { total: baseTotal + ivaMonto } : {}),
    historial: appendHistorial(o, 'metodo_pago', actorEmail, { metodos: limpios, comprobante: comprobanteTipo, retencion_modo: retencionModo, iva_aplicado: aplicaIva, iva_monto: ivaMonto, pago_en_divisa: pagaEnDivisa }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;

  // Guardar/actualizar los datos de pago del proveedor para reutilizarlos en próximas compras.
  if (o.proveedor_id) {
    for (const m of limpios) {
      if (requiereDatos(m.metodo) && 'datos' in m && m.datos) {
        try { await guardarDatosPago(o.proveedor_id, m.metodo, m.datos as DatosPago, actorEmail); } catch { /* no bloquea el flujo */ }
      }
    }
  }
  return data as Orden;
}

export async function rechazarOrden(
  o: Orden,
  actorEmail: string,
  motivo: string
): Promise<Orden> {
  if (o.estado !== 'pendiente') throw new Error('Solo se rechazan órdenes pendientes');
  if (!motivo.trim()) throw new Error('Debes indicar un motivo');
  const patch = {
    estado: 'rechazada' as EstadoOrden,
    rechazada_por: actorEmail,
    rechazada_en: new Date().toISOString(),
    motivo_rechazo: motivo,
    historial: appendHistorial(o, 'rechazada', actorEmail, { motivo }),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/** Genera el siguiente código OC-YYYY-#### contando OCs ÚNICAS ya emitidas. */
export async function nextOcCodigo(): Promise<string> {
  const year = new Date().getFullYear();
  // Cuenta códigos distintos (multiples OPs pueden compartir un mismo oc_codigo).
  const { data, error } = await supabase
    .from(TABLE)
    .select('oc_codigo')
    .not('oc_codigo', 'is', null);
  if (error) throw error;
  const unique = new Set((data ?? []).map((r) => r.oc_codigo as string));
  const seq = String(unique.size + 1).padStart(4, '0');
  return `OC-${year}-${seq}`;
}

/** Lista las OPs aprobadas de un proveedor (excluyendo opcionalmente una específica). */
export async function listAprobadasDeProveedor(proveedorId: string, exceptOrdenId?: string): Promise<Orden[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('estado', 'aprobada')
    .eq('proveedor_id', proveedorId);
  if (exceptOrdenId) q = q.neq('id', exceptOrdenId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

/**
 * Emite UNA orden de compra consolidando varias OPs aprobadas del mismo proveedor.
 * Todas reciben el mismo oc_codigo y pasan a estado 'oc_emitida'.
 */
export async function emitirOrdenCompraGrupo(
  ordenes: Orden[],
  actorEmail: string,
  documentos: string[] = [],
): Promise<{ ocCodigo: string; cantidad: number }> {
  if (!ordenes.length) throw new Error('No hay órdenes para emitir');
  const proveedorId = ordenes[0].proveedor_id;
  if (!proveedorId) throw new Error('La orden no tiene proveedor adjudicado');
  for (const o of ordenes) {
    if (o.estado !== 'aprobada')
      throw new Error(`La orden ${o.codigo} no está aprobada (estado: ${o.estado})`);
    if (o.proveedor_id !== proveedorId)
      throw new Error(`Las órdenes deben tener el mismo proveedor`);
  }

  const ocCodigo = await nextOcCodigo();
  const nowIso = new Date().toISOString();

  // Actualizar cada orden individualmente para preservar su historial.
  for (const o of ordenes) {
    const patch = {
      estado: 'oc_emitida' as EstadoOrden,
      oc_codigo: ocCodigo,
      oc_emitida_por: actorEmail,
      oc_emitida_en: nowIso,
      historial: appendHistorial(o, 'oc_emitida', actorEmail, {
        oc_codigo: ocCodigo,
        consolidada_con: ordenes.filter((x) => x.id !== o.id).map((x) => x.codigo),
        ...(documentos.length ? { documentos } : {}),
      }),
    };
    const { error } = await supabase.from(TABLE).update(patch).eq('id', o.id);
    if (error) throw error;
  }

  return { ocCodigo, cantidad: ordenes.length };
}

/**
 * Emite la orden de compra formal a partir de una orden aprobada.
 * Genera un código OC-YYYY-#### único, cambia estado a 'oc_emitida' y
 * registra timestamp + actor.
 */
export async function emitirOrdenCompra(o: Orden, actorEmail: string): Promise<Orden> {
  if (o.estado !== 'aprobada') throw new Error('Solo se emite OC sobre órdenes aprobadas');
  if (!o.proveedor_id) throw new Error('La orden no tiene proveedor adjudicado');
  const ocCodigo = o.oc_codigo ?? (await nextOcCodigo());
  const patch = {
    estado: 'oc_emitida' as EstadoOrden,
    oc_codigo: ocCodigo,
    oc_emitida_por: actorEmail,
    oc_emitida_en: new Date().toISOString(),
    historial: appendHistorial(o, 'oc_emitida', actorEmail, { oc_codigo: ocCodigo }),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/* ───────── Pago de la OC desde Tesorería (oc_aprobada → pagada) ───────── */

async function subirAdjuntoOc(ordenId: string, file: File, tipo: 'factura' | 'retencion'): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${ordenId}/${tipo}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET_OC).upload(path, file, {
    upsert: true, contentType: file.type || 'application/pdf',
  });
  if (error) throw error;
  return path;
}

export async function urlAdjuntoOc(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_OC).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export interface OrdenPorPagar {
  orden: Orden;
  proveedorNombre: string;
  /** Contra entrega = se paga solo lo recibido. */
  esContraEntrega: boolean;
  /** Monto sugerido a pagar (lo recibido en contra entrega, el total en el resto). */
  montoAPagar: number;
}

function mapPorPagar(orden: Orden, pm: Map<string, string>): OrdenPorPagar {
  const esContraEntrega = orden.condiciones_pago === 'contra_entrega';
  const montoAPagar = esContraEntrega && orden.recibido_total != null ? Number(orden.recibido_total) : Number(orden.total);
  return {
    orden,
    proveedorNombre: (orden.proveedor_id && pm.get(orden.proveedor_id)) || '—',
    esContraEntrega,
    montoAPagar,
  };
}

/** Lista las OC confirmadas (oc_aprobada) pendientes de pago en Tesorería.
 *  Captura anticipado (oc_aprobada) y contra_entrega (oc_aprobada tras recibir e
 *  indicar método). Las de crédito NO aparecen: se saldan por abonos. */
export async function listOrdenesPorPagar(): Promise<OrdenPorPagar[]> {
  const [{ data: os, error }, { data: provs }] = await Promise.all([
    supabase.from(TABLE).select('*').eq('estado', 'oc_aprobada').order('oc_aprobada_en', { ascending: true }),
    supabase.from('proveedores').select('id, razon_social'),
  ]);
  if (error) throw error;
  const pm = new Map((provs ?? []).map((p) => [p.id as string, p.razon_social as string]));
  return (os ?? []).map((r) => mapPorPagar(r as Orden, pm));
}

/** Lista las OC a crédito con cuenta abierta (para la vista de crédito + abonos). */
export async function listOrdenesEnCredito(): Promise<OrdenPorPagar[]> {
  const [{ data: os, error }, { data: provs }] = await Promise.all([
    supabase.from(TABLE).select('*').eq('estado', 'cuenta_abierta').order('oc_aprobada_en', { ascending: true }),
    supabase.from('proveedores').select('id, razon_social'),
  ]);
  if (error) throw error;
  const pm = new Map((provs ?? []).map((p) => [p.id as string, p.razon_social as string]));
  return (os ?? []).map((r) => mapPorPagar(r as Orden, pm));
}

export interface PagarOcInput {
  orden: Orden;
  cajaId: string;
  monto: number;
  factura?: File | null;
  retencion?: File | null;
  motivoPago?: string | null;
  seriales?: string[] | null;   // seriales de billetes (USD físico)
  actorEmail: string;
  actorName?: string | null;
}

/** Normaliza la lista de seriales: recorta, descarta vacíos y duplicados. */
function limpiarSeriales(seriales?: string[] | null): string[] {
  const out: string[] = [];
  for (const s of seriales ?? []) {
    const v = String(s ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Concepto del egreso de una OC: incluye el motivo de la OP y el del pago. */
function conceptoPagoOc(o: Orden, motivoPago?: string | null, sufijo?: string, seriales?: string[] | null): string {
  const ser = limpiarSeriales(seriales);
  const extra = [
    o.notas?.trim() ? `motivo OP: ${o.notas.trim()}` : '',
    motivoPago?.trim() ? `pago: ${motivoPago.trim()}` : '',
    ser.length ? `billetes: ${ser.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return `Pago OC ${o.oc_codigo ?? o.codigo}${extra ? ` · ${extra}` : ''}${sufijo ? ` · ${sufijo}` : ''}`;
}

/**
 * Paga una OC confirmada (estaba `oc_aprobada`): descuenta el monto de la caja
 * elegida (egreso en Tesorería / Libro Mayor, categoría 'pago_oc' casado con la
 * orden), adjunta la factura (y retención opcional) y deja la OC en `pagada`.
 */
export async function pagarOrdenCompra(input: PagarOcInput): Promise<Orden> {
  const { orden: o } = input;
  if (o.estado !== 'oc_aprobada')
    throw new Error('Solo se pagan órdenes de compra confirmadas (aprobadas en lote).');
  if (!input.cajaId) throw new Error('Elegí la caja con la que se paga.');
  const monto = Math.round((Number(input.monto) || 0) * 100) / 100;
  if (monto <= 0) throw new Error('Indicá el monto a pagar.');
  const seriales = limpiarSeriales(input.seriales);

  // 1) Egreso en Tesorería (valida saldo) casado con la orden → aparece en Libro Mayor.
  const mov = await pagarOrden({
    cajaId: input.cajaId, ordenId: o.id, monto,
    concepto: conceptoPagoOc(o, input.motivoPago, undefined, seriales),
    actor: input.actorEmail, actorName: input.actorName ?? null,
  });

  // 2) Adjuntos (factura obligatoria por flujo; retención opcional).
  let facturaPath: string | null = null, facturaNombre: string | null = null;
  let retencionPath: string | null = null, retencionNombre: string | null = null;
  if (input.factura) { facturaPath = await subirAdjuntoOc(o.id, input.factura, 'factura'); facturaNombre = input.factura.name; }
  if (input.retencion) { retencionPath = await subirAdjuntoOc(o.id, input.retencion, 'retencion'); retencionNombre = input.retencion.name; }

  // 3) Cerrar el pago en la orden.
  const patch = {
    estado: 'pagada' as EstadoOrden,
    pagada_por: input.actorEmail,
    pagada_en: new Date().toISOString(),
    caja_id: input.cajaId,
    caja_mov_id: mov.id,
    factura_path: facturaPath, factura_nombre: facturaNombre,
    retencion_path: retencionPath, retencion_nombre: retencionNombre,
    ...(seriales.length ? { seriales_billetes: seriales } : {}),
    // Si la OC es por Factura, al pagar se marca automáticamente en Retenciones.
    ...(o.comprobante_tipo === 'factura' ? { retencion_pagada: true, retencion_pagada_en: new Date().toISOString() } : {}),
    historial: appendHistorial(o, 'pagada', input.actorEmail, { oc_codigo: o.oc_codigo, monto, ...(seriales.length ? { seriales } : {}) }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return data as Orden;
}

export interface PagarOcMultiLeg {
  cuenta: CuentaCaja;
  moneda: string;
  monto: number;        // EN SU PROPIA MONEDA
  montoUsd?: number;    // equivalente USD (solo para la traza)
}
export interface PagarOcMultiInput {
  orden: Orden;
  cajaId: string;
  legs: PagarOcMultiLeg[];
  factura?: File | null;
  motivoPago?: string | null;
  seriales?: string[] | null;   // seriales de billetes (pata USD físico)
  actorEmail: string;
  actorName?: string | null;
}

/**
 * Paga una OC confirmada con MULTIPAGO desde la caja Multimoneda: una pata por
 * moneda (USDT, Bs, USD físico…), cada una descontada de su saldo real en
 * `caja_saldos`. Cada pata queda como un egreso en el Libro Mayor casado con la
 * orden. Deja la OC en `pagada`.
 */
export async function pagarOrdenCompraMulti(input: PagarOcMultiInput): Promise<Orden> {
  const { orden: o } = input;
  if (o.estado !== 'oc_aprobada')
    throw new Error('Solo se pagan órdenes de compra confirmadas (aprobadas en lote).');
  if (!input.cajaId) throw new Error('Elegí la caja con la que se paga.');
  const legs = (input.legs ?? []).filter((l) => l.moneda && (Number(l.monto) || 0) > 0);
  if (!legs.length) throw new Error('Indicá al menos un monto a pagar.');
  const seriales = limpiarSeriales(input.seriales);

  // Un egreso por moneda (cada uno valida el saldo de su cuenta). Los seriales de
  // billetes solo aplican a la pata en USD físico.
  const movIds: string[] = [];
  for (const leg of legs) {
    const serLeg = leg.moneda === 'USD' ? seriales : null;
    const mov = await egresarDivisa({
      cajaId: input.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: leg.monto,
      concepto: conceptoPagoOc(o, input.motivoPago, leg.moneda, serLeg), categoria: 'pago_oc', refOrdenId: o.id,
      actor: input.actorEmail, actorName: input.actorName ?? null,
    });
    movIds.push(mov.id);
  }

  let facturaPath: string | null = null, facturaNombre: string | null = null;
  if (input.factura) { facturaPath = await subirAdjuntoOc(o.id, input.factura, 'factura'); facturaNombre = input.factura.name; }

  const patch = {
    estado: 'pagada' as EstadoOrden,
    pagada_por: input.actorEmail,
    pagada_en: new Date().toISOString(),
    caja_id: input.cajaId,
    caja_mov_id: movIds[0] ?? null,
    factura_path: facturaPath, factura_nombre: facturaNombre,
    ...(seriales.length ? { seriales_billetes: seriales } : {}),
    ...(o.comprobante_tipo === 'factura' ? { retencion_pagada: true, retencion_pagada_en: new Date().toISOString() } : {}),
    historial: appendHistorial(o, 'pagada', input.actorEmail, {
      oc_codigo: o.oc_codigo,
      multipago: legs.map((l) => ({ moneda: l.moneda, cuenta: l.cuenta, monto: l.monto })),
      ...(seriales.length ? { seriales } : {}),
    }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return data as Orden;
}

/**
 * Cierra el ciclo: el analista/obrero confirma que el pedido fue
 * recibido correctamente. Solo aplicable post-recepción.
 */
/** ¿El crédito está totalmente saldado? (Σ abonos ≥ total). */
function creditoSaldado(o: Orden): boolean {
  return (Number(o.abonado_total) || 0) >= Number(o.total) - 0.01;
}

/**
 * Crédito saldado y SIN recibir → lo envía a "Pendiente por recepción" (por_recibir).
 * Lo dispara el analista desde Compras cuando ve la cuenta resaltada como pagada.
 */
export async function enviarCreditoARecepcion(o: Orden, actorEmail: string): Promise<Orden> {
  if (o.estado !== 'cuenta_abierta') throw new Error('Solo aplica a créditos con cuenta abierta.');
  if (!creditoSaldado(o)) throw new Error('La cuenta aún tiene saldo pendiente por pagar.');
  if (o.recibida_en) throw new Error('La mercancía ya fue recibida.');
  const patch = {
    estado: 'por_recibir' as EstadoOrden,
    historial: appendHistorial(o, 'credito_saldado', actorEmail, { enviada_a: 'por_recibir' }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return data as Orden;
}

export async function finalizarPedido(o: Orden, actorEmail: string): Promise<Orden> {
  // Anticipado/contado/crédito finalizan desde 'recibida'. Contra entrega recibe
  // ANTES de pagar, así que finaliza desde 'pagada' (ya tiene recibida_en).
  const contraEntregaPagada = o.estado === 'pagada' && o.condiciones_pago === 'contra_entrega' && !!o.recibida_en;
  // Crédito recibido ANTES de saldar: cuando termina de pagarse queda listo para
  // finalizar directamente (ya entró al inventario, ya está saldado).
  const creditoRecibidoSaldado = o.estado === 'cuenta_abierta' && o.condiciones_pago === 'credito' && !!o.recibida_en && creditoSaldado(o);
  if (o.estado !== 'recibida' && !contraEntregaPagada && !creditoRecibidoSaldado)
    throw new Error('Solo se finaliza una orden ya recibida');
  const patch = {
    estado: 'finalizada' as EstadoOrden,
    finalizada_por: actorEmail,
    finalizada_en: new Date().toISOString(),
    historial: appendHistorial(o, 'finalizada', actorEmail),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/**
 * Recepción PARCIAL: confirma cuánto entró realmente por ítem (≤ lo pedido).
 * Solo lo recibido entra al inventario (entrada con delta = cantidad_recibida y
 * recálculo de PMP). Si hay diferencia se documenta en `nota_recepcion` y la
 * orden cierra como `recibida` SIN saldo pendiente (los faltantes solo se anotan).
 * Para contra_entrega, `recibido_total` es el monto que luego se paga en Tesorería.
 */
export async function recibirOrdenParcial(
  o: Orden,
  recepciones: { sku: string; cantidad_recibida: number }[],
  nota: string | null,
  actorEmail: string,
  actorName: string | null,
  almacenDestino?: string | null,
): Promise<Orden> {
  // 'cuenta_abierta' = crédito: la mercancía puede llegar ANTES de terminar de pagar.
  if (!['por_recibir', 'cuenta_abierta', 'pagada', 'oc_emitida', 'aprobada'].includes(o.estado))
    throw new Error('La orden no está en un estado recibible.');
  if (o.recibida_en) throw new Error('Esta orden ya fue recibida.');
  // Almacén al que entra la mercancía: el elegido al recibir manda; si no, el de la OC.
  const destinoFinal = (almacenDestino && almacenDestino.trim()) || (o.almacen_destino && o.almacen_destino.trim()) || null;
  const recMap = new Map(recepciones.map((r) => [r.sku, Math.max(0, Number(r.cantidad_recibida) || 0)]));
  for (const it of o.items) {
    const rec = recMap.get(it.sku) ?? 0;
    if (rec > Number(it.cantidad)) throw new Error(`No podés recibir más de lo pedido en ${it.sku}.`);
  }
  if (o.items.every((it) => (recMap.get(it.sku) ?? 0) <= 0))
    throw new Error('Indicá al menos una cantidad recibida.');

  // Entradas al inventario solo por lo recibido (>0), recalculando PMP por ítem.
  await Promise.all(o.items.map(async (it) => {
    const rec = recMap.get(it.sku) ?? 0;
    if (!it.productoId || rec <= 0) return;
    const { data: prod, error: pErr } = await supabase
      .from('productos')
      .select('stock, precio, precio_promedio, almacen')
      .eq('id', it.productoId)
      .maybeSingle();
    if (pErr) throw pErr;
    const stockAntes = Number(prod?.stock ?? 0);
    const stockDespues = stockAntes + rec;
    const almacenProd = destinoFinal || (prod?.almacen as string) || 'General';
    const precioActual = Number(prod?.precio_promedio ?? prod?.precio ?? 0);
    const precioCompra = Number(it.precio);
    const precioPromedio = stockDespues > 0
      ? Number(((stockAntes * precioActual + rec * precioCompra) / stockDespues).toFixed(4))
      : precioCompra;

    const { error: mErr } = await supabase.from('movimientos').insert({
      producto_id: it.productoId,
      tipo: 'entrada',
      delta: rec,
      stock_antes: stockAntes,
      stock_despues: stockDespues,
      actor: actorEmail,
      actor_name: actorName,
      ref_tipo: 'orden',
      ref_id: o.id,
      ref_codigo: o.codigo,
      proveedor_id: o.proveedor_id,
      detalle: `Recepción de ${rec}/${it.cantidad} ${it.sku} @ $${precioCompra.toFixed(2)} (promedio: $${precioPromedio.toFixed(2)}) → ${almacenProd}`,
    });
    if (mErr) throw mErr;

    const { error: uErr } = await supabase
      .from('productos')
      .update({ stock: stockDespues, precio: precioCompra, precio_promedio: precioPromedio })
      .eq('id', it.productoId);
    if (uErr) throw uErr;

    const { data: exRow } = await supabase
      .from('existencias')
      .select('stock')
      .eq('producto_id', it.productoId)
      .eq('almacen', almacenProd)
      .maybeSingle();
    const exStockNuevo = (Number(exRow?.stock) || 0) + rec;
    const { error: exErr } = await supabase
      .from('existencias')
      .upsert(
        { producto_id: it.productoId, almacen: almacenProd, stock: exStockNuevo, costo_promedio: precioPromedio, updated_at: new Date().toISOString() },
        { onConflict: 'producto_id,almacen' },
      );
    if (exErr) throw exErr;
  }));

  const itemsRec = o.items.map((it) => ({ ...it, cantidad_recibida: recMap.get(it.sku) ?? 0 }));
  const recibidoTotal = Math.round(itemsRec.reduce((a, it) => a + (it.cantidad_recibida ?? 0) * Number(it.precio), 0) * 100) / 100;
  const huboDiferencia = itemsRec.some((it) => (it.cantidad_recibida ?? 0) < Number(it.cantidad));
  // Crédito recibido sin terminar de pagar: queda RECIBIDO pero la cuenta sigue
  // abierta (pendiente por pagar). Cuando se salde, pasará a 'recibida' y se finaliza.
  const esCredito = o.condiciones_pago === 'credito';
  const saldadoCredito = (Number(o.abonado_total) || 0) >= Number(o.total) - 0.01;
  const estadoRecepcion: EstadoOrden = esCredito && !saldadoCredito ? 'cuenta_abierta' : 'recibida';
  const patch = {
    estado: estadoRecepcion,
    items: itemsRec,
    recibido_total: recibidoTotal,
    ...(destinoFinal ? { almacen_destino: destinoFinal } : {}),
    nota_recepcion: huboDiferencia ? (nota?.trim() || 'Recepción parcial: llegó menos de lo solicitado.') : (nota?.trim() || null),
    recibida_por: actorEmail,
    recibida_en: new Date().toISOString(),
    historial: appendHistorial(o, 'recibida', actorEmail, { recibido_total: recibidoTotal, parcial: huboDiferencia, nota: nota?.trim() || null, almacen_destino: destinoFinal }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return data as Orden;
}

/**
 * Registra un ABONO de una compra a crédito: descuenta el monto de la caja
 * (egreso real en Tesorería vía pagarOrden) y lo acumula. Al saldar el total
 * (Σ abonos ≥ total) la orden pasa a `por_recibir` (Pendiente por recepción).
 */
export async function registrarAbono(
  o: Orden,
  monto: number,
  cajaId: string,
  moneda: string,
  nota: string | null,
  actorEmail: string,
  actorName: string | null,
  factura?: File | null,
): Promise<{ orden: Orden; abono: AbonoCredito }> {
  if (o.estado !== 'cuenta_abierta') throw new Error('Solo se abonan órdenes a crédito con cuenta abierta.');
  if (!cajaId) throw new Error('Elegí la caja del abono.');
  const m = Math.round((Number(monto) || 0) * 100) / 100;
  if (m <= 0) throw new Error('Indicá el monto del abono.');

  // Egreso real en Tesorería (valida saldo) casado con la orden.
  const mov = await pagarOrden({
    cajaId, ordenId: o.id, monto: m,
    concepto: `Abono crédito ${o.oc_codigo ?? o.codigo}`,
    actor: actorEmail, actorName: actorName ?? null,
  });

  // Comprobante del abono (opcional, reusa el storage de adjuntos de la OC).
  let comprobantePath: string | null = null, comprobanteNombre: string | null = null;
  if (factura) { comprobantePath = await subirAdjuntoOc(o.id, factura, 'factura'); comprobanteNombre = factura.name; }

  const { data: prev } = await supabase.from('abonos_credito').select('monto').eq('orden_id', o.id);
  const previo = (prev ?? []).reduce((a, r) => a + Number((r as { monto: number }).monto), 0);
  const acumulado = Math.round((previo + m) * 100) / 100;
  const saldoRestante = Math.round((Number(o.total) - acumulado) * 100) / 100;

  const { data: ab, error: abErr } = await supabase
    .from('abonos_credito')
    .insert({
      orden_id: o.id, monto: m, moneda, caja_id: cajaId, caja_mov_id: mov.id,
      saldo_restante: saldoRestante, actor: actorEmail, actor_name: actorName ?? null, nota: nota?.trim() || null,
      comprobante_path: comprobantePath, comprobante_nombre: comprobanteNombre,
    })
    .select('*')
    .single();
  if (abErr) throw abErr;

  const saldado = acumulado >= Number(o.total) - 0.01;
  // No se cambia de estado automáticamente al saldar (ver registrarAbonoMulti).
  const patch = {
    abonado_total: acumulado,
    historial: appendHistorial(o, saldado ? 'credito_saldado' : 'abono', actorEmail, { monto: m, saldo_restante: saldoRestante }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return { orden: data as Orden, abono: ab as AbonoCredito };
}

export interface AbonoLeg {
  cajaId: string;
  cuenta: CuentaCaja;
  moneda: string;
  monto: number;        // en su propia moneda
  montoUsd: number;     // equivalente USD (para acumular contra el total)
}
export interface RegistrarAbonoMultiInput {
  orden: Orden;
  legs: AbonoLeg[];
  nota?: string | null;
  factura?: File | null;
  actorEmail: string;
  actorName?: string | null;
}

/**
 * Abono MULTIPAGO de una compra a crédito desde Tesorería: una pata por moneda
 * (USDT, Bs, USD físico…), cada una descontada de su saldo real (`caja_saldos`).
 * El abono acumulado se mide en USD (equivalente con la tasa del día). Al saldar
 * el total, la orden pasa a `recibida` (si ya llegó) o `por_recibir`.
 */
export async function registrarAbonoMulti(input: RegistrarAbonoMultiInput): Promise<{ orden: Orden; abono: AbonoCredito }> {
  const { orden: o } = input;
  if (o.estado !== 'cuenta_abierta') throw new Error('Solo se abonan órdenes a crédito con cuenta abierta.');
  const legs = (input.legs ?? []).filter((l) => l.cajaId && l.moneda && (Number(l.monto) || 0) > 0);
  if (!legs.length) throw new Error('Indicá al menos un monto a abonar.');
  const abonoUsd = Math.round(legs.reduce((a, l) => a + (Number(l.montoUsd) || 0), 0) * 100) / 100;
  if (abonoUsd <= 0) throw new Error('El abono debe ser mayor que 0.');

  // Un egreso por moneda (cada uno valida su saldo).
  const movIds: string[] = [];
  for (const leg of legs) {
    const mov = await egresarDivisa({
      cajaId: leg.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: leg.monto,
      concepto: `Abono crédito ${o.oc_codigo ?? o.codigo} · ${leg.moneda}`, categoria: 'pago_oc', refOrdenId: o.id,
      actor: input.actorEmail, actorName: input.actorName ?? null,
    });
    movIds.push(mov.id);
  }

  let comprobantePath: string | null = null, comprobanteNombre: string | null = null;
  if (input.factura) { comprobantePath = await subirAdjuntoOc(o.id, input.factura, 'factura'); comprobanteNombre = input.factura.name; }

  const { data: prev } = await supabase.from('abonos_credito').select('monto').eq('orden_id', o.id);
  const previo = (prev ?? []).reduce((a, r) => a + Number((r as { monto: number }).monto), 0);
  const acumulado = Math.round((previo + abonoUsd) * 100) / 100;
  const saldoRestante = Math.round((Number(o.total) - acumulado) * 100) / 100;
  const detalle = legs.map((l) => `${l.monto} ${l.moneda}`).join(' + ');

  const { data: ab, error: abErr } = await supabase
    .from('abonos_credito')
    .insert({
      orden_id: o.id, monto: abonoUsd, moneda: 'USD', caja_id: legs[0].cajaId, caja_mov_id: movIds[0] ?? null,
      saldo_restante: saldoRestante, actor: input.actorEmail, actor_name: input.actorName ?? null,
      nota: [input.nota?.trim(), `Multipago: ${detalle}`].filter(Boolean).join(' · '),
      comprobante_path: comprobantePath, comprobante_nombre: comprobanteNombre,
    })
    .select('*')
    .single();
  if (abErr) throw abErr;

  const saldado = acumulado >= Number(o.total) - 0.01;
  // No saltamos de estado automáticamente: el crédito queda saldado pero la
  // orden sigue como `cuenta_abierta` (resaltada en Compras). El analista decide
  // enviarla a recepción o finalizarla (si ya llegó) desde el detalle.
  const patch = {
    abonado_total: acumulado,
    historial: appendHistorial(o, saldado ? 'credito_saldado' : 'abono', input.actorEmail, { monto: abonoUsd, saldo_restante: saldoRestante, multipago: legs.map((l) => ({ moneda: l.moneda, monto: l.monto })) }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return { orden: data as Orden, abono: ab as AbonoCredito };
}

/** Traza de abonos de una orden a crédito (orden cronológico). */
export async function listAbonos(ordenId: string): Promise<AbonoCredito[]> {
  const { data, error } = await supabase
    .from('abonos_credito')
    .select('*')
    .eq('orden_id', ordenId)
    .order('at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AbonoCredito[];
}

/**
 * Estados desde los que se puede cancelar.
 *  - OP en revisión/aprobada (antes de elegir oferta).
 *  - OC ya aprobada por el gerente o con el proveedor desistido, SIEMPRE que aún
 *    no se haya pagado (cancelar tras el pago implicaría un reembolso, fuera de
 *    este flujo). Por eso NO se incluyen `pagada`, `oc_emitida`, recepción, etc.
 */
const ESTADOS_CANCELABLES: EstadoOrden[] = [
  'pendiente',
  'aprobada',
  'oc_creada',
  'confirmada_metodo',
  'oc_aprobada',
  'desistida_proveedor',
];

export async function cancelarOrden(
  o: Orden,
  actorEmail: string,
  motivo: string
): Promise<Orden> {
  if (!ESTADOS_CANCELABLES.includes(o.estado))
    throw new Error('La orden no se puede cancelar en su estado actual (ya pagada o recibida)');
  if (!motivo.trim()) throw new Error('Debes indicar un motivo');
  const patch = {
    estado: 'cancelada' as EstadoOrden,
    historial: appendHistorial(o, 'cancelada', actorEmail, { motivo }),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

export async function desistirProveedor(
  o: Orden,
  actorEmail: string,
  motivo: string
): Promise<Orden> {
  if (o.estado !== 'aprobada')
    throw new Error('Solo se registra desistimiento sobre órdenes aprobadas');
  if (!motivo.trim()) throw new Error('Debes indicar por qué no cumplió el proveedor');

  // 1) Reabrir las ofertas previamente descartadas para que el jefe pueda re-elegir.
  const { error: reopenErr } = await supabase
    .from('ofertas_proveedor')
    .update({ estado: 'pendiente', motivo_descarte: null, decidida_por_email: null, decidida_en: null })
    .eq('orden_id', o.id)
    .eq('estado', 'descartada');
  if (reopenErr) throw reopenErr;

  // 2) Descartar la oferta aceptada (la del proveedor que desistió) con motivo.
  const { error: discardErr } = await supabase
    .from('ofertas_proveedor')
    .update({
      estado: 'descartada',
      motivo_descarte: `Proveedor desistió: ${motivo}`,
      decidida_por_email: actorEmail,
      decidida_en: new Date().toISOString(),
    })
    .eq('orden_id', o.id)
    .eq('estado', 'aceptada');
  if (discardErr) throw discardErr;

  const patch = {
    estado: 'desistida_proveedor' as EstadoOrden,
    historial: appendHistorial(o, 'desistida_proveedor', actorEmail, {
      motivo,
      proveedorAnteriorId: o.proveedor_id,
    }),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', o.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Orden;
}

/* ============================================================
   FASE 1 · Trazabilidad y comparativa histórica de precios
   ============================================================ */

export interface PrecioHistorico {
  proveedor_id: string;
  proveedor_nombre: string;
  precio: number;
  cantidad: number;
  fecha: string;
  codigo_orden: string;
  estado_orden: EstadoOrden;
}

/**
 * Comparativa histórica de precios para un SKU dado, agrupada por proveedor
 * (todas las apariciones del SKU en órdenes pasadas).
 */
export async function getHistoricoPreciosPorSku(sku: string): Promise<PrecioHistorico[]> {
  const { data: ordenes, error } = await supabase
    .from(TABLE)
    .select('id, codigo, proveedor_id, items, estado, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const provIds = Array.from(
    new Set((ordenes ?? []).map((o) => o.proveedor_id).filter(Boolean))
  );
  let provMap = new Map<string, string>();
  if (provIds.length) {
    const { data: provs } = await supabase
      .from('proveedores')
      .select('id, razon_social')
      .in('id', provIds);
    provMap = new Map((provs ?? []).map((p) => [p.id as string, p.razon_social as string]));
  }

  const out: PrecioHistorico[] = [];
  for (const o of ordenes ?? []) {
    const items = (o.items ?? []) as ItemOrden[];
    for (const it of items) {
      if (it.sku === sku) {
        out.push({
          proveedor_id: o.proveedor_id,
          proveedor_nombre: provMap.get(o.proveedor_id) ?? '—',
          precio: Number(it.precio),
          cantidad: Number(it.cantidad),
          fecha: o.created_at as string,
          codigo_orden: o.codigo as string,
          estado_orden: o.estado as EstadoOrden,
        });
      }
    }
  }
  return out;
}
