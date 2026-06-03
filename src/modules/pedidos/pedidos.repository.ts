import { supabase } from '@/shared/lib/supabase';
import { pagarOrden } from '@/modules/tesoreria/tesoreria.repository';
import type {
  EstadoOrden,
  EventoHistorial,
  ItemOrden,
  Orden,
  Producto,
  Proveedor,
  Usuario,
} from '@/shared/lib/types';

/** Bucket de Storage para los adjuntos de pago de OC (factura / retención). */
const BUCKET_OC = 'compras-oc';

/* ============================================================
   MGG · Pedidos (Órdenes) · Repository
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
  clasificacion?: string[] | null;
  solicitante_email: string;
  solicitante: string | null;
  ci_solicitante: string | null;
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
    ci_solicitante: input.ci_solicitante,
    items: input.items,
    total,
    estado: 'pendiente' as EstadoOrden,
    notas: input.notas ?? null,
    clasificacion: input.clasificacion?.length ? input.clasificacion : null,
    historial,
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single();
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
  const patch = {
    estado: 'oc_creada' as EstadoOrden,
    proveedor_id: ofertaProveedorId,
    items: ofertaItems,
    total: ofertaPrecioTotal,
    oc_codigo: ocCodigo,
    oc_creada_por: actorEmail,
    oc_creada_en: nowIso,
    historial: appendHistorial(o, 'oc_creada', actorEmail, {
      proveedorId: ofertaProveedorId,
      precio: ofertaPrecioTotal,
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

/**
 * Aprueba/confirma EN LOTE varias OCs creadas (checklist). Cada OC pasa de
 * `oc_creada` → `oc_aprobada` y queda lista para que Tesorería la pague.
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
    const patch = {
      estado: 'oc_aprobada' as EstadoOrden,
      oc_aprobada_por: actorEmail,
      oc_aprobada_en: nowIso,
      // Si se indicó destino, lo guardamos; si no, conservamos el que ya tuviera la orden.
      ...(destino ? { almacen_destino: destino } : {}),
      historial: appendHistorial(o, 'oc_aprobada', actorEmail, { oc_codigo: o.oc_codigo, almacen_destino: destino }),
    };
    const { error } = await supabase.from(TABLE).update(patch).eq('id', o.id);
    if (error) throw error;
  }
  return elegibles.length;
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
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
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
}

/** Lista las OC confirmadas (oc_aprobada) pendientes de pago en Tesorería. */
export async function listOrdenesPorPagar(): Promise<OrdenPorPagar[]> {
  const [{ data: os, error }, { data: provs }] = await Promise.all([
    supabase.from(TABLE).select('*').eq('estado', 'oc_aprobada').order('oc_aprobada_en', { ascending: true }),
    supabase.from('proveedores').select('id, razon_social'),
  ]);
  if (error) throw error;
  const pm = new Map((provs ?? []).map((p) => [p.id as string, p.razon_social as string]));
  return (os ?? []).map((r) => {
    const orden = r as Orden;
    return { orden, proveedorNombre: (orden.proveedor_id && pm.get(orden.proveedor_id)) || '—' };
  });
}

export interface PagarOcInput {
  orden: Orden;
  cajaId: string;
  monto: number;
  factura?: File | null;
  retencion?: File | null;
  actorEmail: string;
  actorName?: string | null;
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

  // 1) Egreso en Tesorería (valida saldo) casado con la orden → aparece en Libro Mayor.
  const mov = await pagarOrden({
    cajaId: input.cajaId, ordenId: o.id, monto,
    concepto: `Pago OC ${o.oc_codigo ?? o.codigo}`,
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
    historial: appendHistorial(o, 'pagada', input.actorEmail, { oc_codigo: o.oc_codigo, monto }),
  };
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', o.id).select('*').single();
  if (error) throw error;
  return data as Orden;
}

/**
 * Cierra el ciclo: el analista/obrero confirma que el pedido fue
 * recibido correctamente. Solo aplicable post-recepción.
 */
export async function finalizarPedido(o: Orden, actorEmail: string): Promise<Orden> {
  if (o.estado !== 'recibida')
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

export async function recibirOrden(
  o: Orden,
  actorEmail: string,
  actorName: string | null
): Promise<Orden> {
  if (!['pagada', 'oc_emitida', 'aprobada'].includes(o.estado))
    throw new Error('Solo se recibe una orden de compra ya pagada');

  // Generar movimientos de entrada por cada ítem. Calculamos stock_antes/después
  // y el nuevo precio promedio ponderado (cost averaging) leyendo el producto.
  // Cada ítem es un producto distinto → procesamos en paralelo.
  await Promise.all(o.items.map(async (it) => {
    if (!it.productoId) return;
    const { data: prod, error: pErr } = await supabase
      .from('productos')
      .select('stock, precio, precio_promedio, almacen')
      .eq('id', it.productoId)
      .maybeSingle();
    if (pErr) throw pErr;
    const stockAntes = Number(prod?.stock ?? 0);
    const stockDespues = stockAntes + Number(it.cantidad);
    // La mercancía entra al almacén destino elegido al confirmar la OC; si no se
    // eligió (OCs viejas o confirmadas en lote sin destino), cae al del producto.
    const almacenProd = (o.almacen_destino && o.almacen_destino.trim()) || (prod?.almacen as string) || 'General';

    // Precio promedio ponderado: ((stock × precio_actual) + (cantidad × precio_compra)) / stock_total
    const precioActual = Number(prod?.precio_promedio ?? prod?.precio ?? 0);
    const precioCompra = Number(it.precio);
    const cantidad = Number(it.cantidad);
    const precioPromedio = stockDespues > 0
      ? Number(((stockAntes * precioActual + cantidad * precioCompra) / stockDespues).toFixed(4))
      : precioCompra;

    const { error: mErr } = await supabase.from('movimientos').insert({
      producto_id: it.productoId,
      tipo: 'entrada',
      delta: it.cantidad,
      stock_antes: stockAntes,
      stock_despues: stockDespues,
      actor: actorEmail,
      actor_name: actorName,
      ref_tipo: 'orden',
      ref_id: o.id,
      ref_codigo: o.codigo,
      proveedor_id: o.proveedor_id,
      detalle: `Recepción de ${it.cantidad} ${it.sku} @ $${precioCompra.toFixed(2)} (promedio: $${precioPromedio.toFixed(2)}) → ${almacenProd}`,
    });
    if (mErr) throw mErr;

    const { error: uErr } = await supabase
      .from('productos')
      .update({ stock: stockDespues, precio: precioCompra, precio_promedio: precioPromedio })
      .eq('id', it.productoId);
    if (uErr) throw uErr;

    // Mantener la existencia del almacén del producto en sincronía con el stock
    // recibido (la cantidad entra al almacén del producto). Evita que producción
    // e inventario por almacén muestren cantidades irreales.
    const { data: exRow } = await supabase
      .from('existencias')
      .select('stock')
      .eq('producto_id', it.productoId)
      .eq('almacen', almacenProd)
      .maybeSingle();
    const exStockNuevo = (Number(exRow?.stock) || 0) + Number(it.cantidad);
    const { error: exErr } = await supabase
      .from('existencias')
      .upsert(
        { producto_id: it.productoId, almacen: almacenProd, stock: exStockNuevo, costo_promedio: precioPromedio, updated_at: new Date().toISOString() },
        { onConflict: 'producto_id,almacen' },
      );
    if (exErr) throw exErr;
  }));

  const patch = {
    estado: 'recibida' as EstadoOrden,
    historial: appendHistorial(o, 'recibida', actorEmail),
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

export async function cancelarOrden(
  o: Orden,
  actorEmail: string,
  motivo: string
): Promise<Orden> {
  if (!['pendiente', 'aprobada'].includes(o.estado))
    throw new Error('Solo se cancelan órdenes pendientes o aprobadas');
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
