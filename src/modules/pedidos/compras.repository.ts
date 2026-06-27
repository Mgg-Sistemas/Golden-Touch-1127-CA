/* ============================================================
   Golden Touch · Compra Directa (Supabase)
   Compras sin proveedor con VARIOS materiales + cantidad (sin
   precios al crear). NO lleva aprobación. Flujo: EN PROCESO → FINALIZADA.
   Al completar se adjunta la factura, se colocan los precios por material
   y la CAJA de la que sale el dinero (pasa por Tesorería: egreso en el
   Libro Mayor); cada material entra al inventario como ENTRADA
   (costo = gasto/cant → PMP).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { createProducto, nextSku, updateProducto } from '@/modules/inventario/inventario.repository';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { egresarGastoCaja, ingresarDineroCaja } from '@/modules/salidas/cajas.repository';
import { egresarDivisa, revertirEgresoDivisa } from '@/modules/tesoreria/cajaSaldos.repository';
import type { Producto, CuentaCaja } from '@/shared/lib/types';

/** Pata de pago multimoneda: cuánto sale de cada (cuenta, moneda) de la caja. */
export interface PagoLeg { cuenta: CuentaCaja; moneda: string; monto: number; }

const BUCKET = 'compras-directas';

export type EstadoCompraDirecta = 'en_proceso' | 'por_pagar' | 'finalizada';

export interface CompraDirectaItem {
  producto_id: string;
  producto_nombre: string;
  producto_sku: string | null;
  cantidad: number;
  /** Gasto del renglón (se carga al finalizar). */
  gasto?: number | null;
}

export interface CompraDirecta {
  id: string;
  /** Correlativo de la compra directa (CD-AAAA-####). */
  codigo: string | null;
  producto_id: string | null;
  producto_nombre: string;
  producto_sku: string | null;
  almacen: string;
  cantidad: number;
  items: CompraDirectaItem[];
  /** Proveedor opcional (directorio). Si se tipea uno nuevo, se da de alta en `proveedores`. */
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  estado: EstadoCompraDirecta;
  gasto: number | null;
  caja_id: string | null;
  caja_mov_id: string | null;
  /** Desglose multimoneda del pago (para revertir exacto al reabrir). Null si fue caja simple. */
  pago_legs: PagoLeg[] | null;
  adjunto_path: string | null;
  adjunto_nombre: string | null;
  mov_id: string | null;
  /** Etiqueta de gasto que coloca Tesorería al pagar. */
  gasto_categoria: string | null;
  gasto_subcategoria: string | null;
  /** Comprobante de pago (lo completa Tesorería al pagar). */
  pagada_at: string | null;
  pagada_por: string | null;
  pagada_por_name: string | null;
  /** Cuándo el analista la envió a pagar (montó con factura). */
  enviada_pagar_at: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
  aprobada_at: string | null;
  aprobada_por: string | null;
  finalizada_at: string | null;
  updated_at: string;
}

/** Normaliza una fila: las antiguas (un solo producto) se exponen como items[]. */
function normalizar(row: Record<string, unknown>): CompraDirecta {
  const r = row as unknown as CompraDirecta;
  let items = Array.isArray(r.items) ? r.items : [];
  if (!items.length && r.producto_id) {
    items = [{
      producto_id: r.producto_id, producto_nombre: r.producto_nombre,
      producto_sku: r.producto_sku, cantidad: Number(r.cantidad) || 0, gasto: r.gasto ?? null,
    }];
  }
  return { ...r, items };
}

/**
 * Genera el siguiente correlativo CD-AAAA-#### (Compra Directa) con un contador
 * ATÓMICO en la base (`next_correlativo`): nunca retrocede ni reutiliza aunque se
 * borren compras, y es seguro entre varios usuarios a la vez.
 */
export async function nextCodigoCompraDirecta(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `cd-${year}` });
  if (error) throw error;
  const seq = String(Number(data) || 1).padStart(4, '0');
  return `CD-${year}-${String(seq).padStart(4, '0')}`;
}

export async function listComprasDirectas(): Promise<CompraDirecta[]> {
  const { data, error } = await supabase
    .from('compras_directas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/* ───────── Alta (varios materiales) ───────── */

export interface LineaExistente { modo: 'existente'; productoId: string; cantidad: number; unidad?: string }
export interface LineaNueva { modo: 'nuevo'; nombre: string; categoria: string; unidad: string; cantidad: number }
export type LineaCompra = LineaExistente | LineaNueva;

export interface CrearCompraInput {
  lineas: LineaCompra[];
  almacen: string;
  /** Proveedor opcional ya existente en el directorio. */
  proveedorId?: string | null;
  /** Nombre del proveedor (para mostrar sin re-consultar). */
  proveedorNombre?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Crea una compra directa EN PROCESO con uno o varios materiales. Los materiales
 * nuevos se dan de alta en el inventario (stock 0, sin precio) y se usan sus ids.
 */
export async function crearCompraDirecta(
  input: CrearCompraInput,
  productosExistentes: Producto[] = [],
): Promise<CompraDirecta> {
  const almacen = input.almacen.trim() || 'General';
  const lineas = input.lineas.filter((l) => (Number(l.cantidad) || 0) > 0);
  if (!lineas.length) throw new Error('Agregá al menos un material con cantidad.');

  const items: CompraDirectaItem[] = [];
  for (const l of lineas) {
    const cantidad = Number(l.cantidad) || 0;
    if (l.modo === 'existente') {
      if (!l.productoId) throw new Error('Elegí el material en cada renglón.');
      const p = productosExistentes.find((x) => x.id === l.productoId) ?? null;
      // Si se cambió la medida del producto existente, se actualiza en el inventario.
      const nuevaUnidad = (l.unidad ?? '').trim();
      if (p && nuevaUnidad && nuevaUnidad !== (p.unidad ?? '')) {
        await updateProducto(p.id, { unidad: nuevaUnidad });
        p.unidad = nuevaUnidad;
      }
      items.push({ producto_id: l.productoId, producto_nombre: p?.nombre ?? '', producto_sku: p?.sku ?? null, cantidad });
    } else {
      const nom = l.nombre.trim().toUpperCase();
      if (!nom) throw new Error('Indicá el nombre del material nuevo.');
      const nuevo = await createProducto({
        sku: await nextSku(l.categoria, productosExistentes),
        nombre: nom, categoria: l.categoria, unidad: l.unidad,
        stock: 0, stock_min: 0, precio: 0, almacen, estado: 'activo',
      });
      productosExistentes = [...productosExistentes, nuevo];
      items.push({ producto_id: nuevo.id, producto_nombre: nuevo.nombre, producto_sku: nuevo.sku, cantidad });
    }
  }

  const totalCantidad = items.reduce((a, i) => a + i.cantidad, 0);
  const resumen = items.length === 1 ? items[0].producto_nombre : `${items.length} materiales`;
  const codigo = await nextCodigoCompraDirecta();

  const { data, error } = await supabase
    .from('compras_directas')
    .insert({
      codigo,
      producto_id: items.length === 1 ? items[0].producto_id : null,
      producto_nombre: resumen,
      producto_sku: items.length === 1 ? items[0].producto_sku : null,
      almacen,
      cantidad: totalCantidad,
      items,
      proveedor_id: input.proveedorId ?? null,
      proveedor_nombre: input.proveedorNombre?.trim() || null,
      estado: 'en_proceso',
      actor: input.actor,
      actor_name: input.actorName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/**
 * Elimina una compra directa que todavía está EN PROCESO (no movió caja ni inventario).
 * Las FINALIZADAS no se borran desde acá: ya descontaron dinero y dieron entrada al
 * inventario, así que revertirlas requeriría deshacer esos movimientos.
 */
export async function eliminarCompraDirecta(compra: CompraDirecta): Promise<void> {
  if (compra.estado !== 'en_proceso')
    throw new Error('Solo se pueden eliminar compras directas que estén En proceso.');
  const { error } = await supabase.from('compras_directas').delete().eq('id', compra.id);
  if (error) throw error;
}

/* ───────── Adjunto en Storage ───────── */

export async function subirAdjuntoCompra(compraId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${compraId}/${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true, contentType: file.type || 'application/pdf',
  });
  if (error) throw error;
  return path;
}

export async function urlAdjuntoCompra(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

/* ───────── Completar (factura + precios + caja de Tesorería) ───────── */

export interface FinalizarCompraInput {
  compra: CompraDirecta;
  /** Gasto (precio) por material (alineado con compra.items). */
  items: CompraDirectaItem[];
  /** Caja de Tesorería de la que sale el dinero. */
  cajaId: string;
  /** Si la caja es Multimoneda: cuánto sale de cada moneda/cuenta (en su moneda).
   *  Cuando viene, el egreso descuenta cada saldo real (no la caja legacy). */
  legs?: PagoLeg[];
  /** Categoría y subcategoría de gasto (Tesorería) que se etiqueta en el movimiento. */
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  file?: File | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Completa la compra directa (estaba EN PROCESO): adjunta la factura, descuenta el
 * gasto total de la caja elegida (egreso en Tesorería/Libro Mayor), registra la
 * ENTRADA de cada material al inventario (costo = precio_renglón / cantidad → PMP)
 * y cierra la compra.
 */
export async function finalizarCompraDirecta(input: FinalizarCompraInput): Promise<void> {
  const { compra } = input;
  if (compra.estado !== 'en_proceso') throw new Error('Esta compra ya fue completada.');
  if (!input.cajaId) throw new Error('Elegí la caja de la que sale el dinero.');
  const items = input.items.map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('La compra no tiene materiales.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('Indicá cuánto se gastó.');

  // 1) Egreso de la caja (valida saldo) → pasa por Tesorería.
  const concepto = `Compra directa · ${compra.producto_nombre}`;
  const legs = (input.legs ?? []).filter((l) => Number(l.monto) > 0);
  let movCajaId: string;
  if (legs.length) {
    // Caja Multimoneda: descuenta cada moneda/cuenta de su saldo real.
    let primero: string | null = null;
    for (const leg of legs) {
      const r = await egresarDivisa({
        cajaId: input.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, categoria: 'compra_directa',
        gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
        actor: input.actor, actorName: input.actorName ?? null,
      });
      if (!primero) primero = r.id;
    }
    if (!primero) throw new Error('Indicá cuánto pagar en al menos una moneda.');
    movCajaId = primero;
  } else {
    // Caja de una sola moneda: descuenta el saldo VISIBLE de la caja (cajas.saldo) para
    // que el gasto se sincronice con el saldo que se ve en el selector y en Cajas.
    const movCaja = await egresarGastoCaja({
      cajaId: input.cajaId, monto: total,
      concepto, categoria: 'compra_directa',
      gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
      actor: input.actor, actorName: input.actorName ?? null,
    });
    movCajaId = movCaja.id;
  }

  // 2) Adjunto opcional.
  let adjuntoPath: string | null = null;
  let adjuntoNombre: string | null = null;
  if (input.file) {
    adjuntoPath = await subirAdjuntoCompra(compra.id, input.file);
    adjuntoNombre = input.file.name;
  }

  // 3) Entrada al inventario por cada material (costo = gasto / cantidad).
  let primerMov: string | null = null;
  for (const it of items) {
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0 || !it.producto_id) continue;
    const costoUnit = (it.gasto || 0) > 0 ? Math.round(((it.gasto || 0) / cantidad) * 10000) / 10000 : 0;
    const mov = await registrarMovimiento({
      producto_id: it.producto_id, tipo: 'entrada', delta: cantidad, almacen: compra.almacen,
      actor: input.actor, actor_name: input.actorName ?? null,
      ref_tipo: 'compra_directa', ref_id: compra.id,
      detalle: `Compra directa · ${it.producto_nombre}`, precio_unitario: costoUnit,
    });
    if (!primerMov) primerMov = mov.id;
  }

  // 4) Cerrar la OCD.
  const { error } = await supabase
    .from('compras_directas')
    .update({
      estado: 'finalizada', gasto: total, items,
      caja_id: input.cajaId, caja_mov_id: movCajaId,
      pago_legs: legs.length ? legs : null,
      adjunto_path: adjuntoPath, adjunto_nombre: adjuntoNombre,
      mov_id: primerMov,
      finalizada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', compra.id);
  if (error) throw error;
}

/* ───────── Reabrir (revertir Tesorería + Inventario) ───────── */

/**
 * Reabre una compra directa FINALIZADA para poder editarla: deshace el egreso de la
 * caja (devuelve el dinero a Tesorería) y revierte la ENTRADA de cada material al
 * inventario (saca lo que había entrado), y la deja EN PROCESO. Luego puede editarse
 * y re-finalizarse normalmente (vuelve a descontar caja + dar entrada).
 *
 * ⚠ Reversión NO atómica (deuda conocida, ver movimientos.repository): si algo falla
 * a mitad puede quedar un estado parcial. El inventario se clampa a ≥ 0.
 */
export async function reabrirCompraDirecta(compra: CompraDirecta, actor: string, actorName?: string | null): Promise<void> {
  if (compra.estado !== 'finalizada') throw new Error('Solo se puede reabrir una compra FINALIZADA.');

  // 1) Devolver el dinero a la caja (revertir el egreso de Tesorería).
  const concepto = `Reapertura ${compra.codigo ?? ''} · ${compra.producto_nombre}`.trim();
  const legs = Array.isArray(compra.pago_legs) ? compra.pago_legs.filter((l) => Number(l.monto) > 0) : [];
  if (legs.length) {
    for (const leg of legs) {
      await revertirEgresoDivisa({
        cajaId: compra.caja_id!, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, actor, actorName: actorName ?? null,
      });
    }
  } else if (compra.caja_id && (compra.gasto || 0) > 0) {
    await ingresarDineroCaja({
      cajaId: compra.caja_id, monto: Number(compra.gasto), concepto, categoria: 'reverso',
      actor, actorName: actorName ?? null,
    });
  }

  // 2) Revertir la entrada al inventario de cada material (salida por la misma cantidad).
  for (const it of compra.items) {
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0 || !it.producto_id) continue;
    await registrarMovimiento({
      producto_id: it.producto_id, tipo: 'salida', delta: -cantidad, almacen: compra.almacen,
      actor, actor_name: actorName ?? null,
      ref_tipo: 'compra_directa_reapertura', ref_id: compra.id,
      detalle: `Reapertura compra directa · ${it.producto_nombre}`,
    });
  }

  // 3) Volver a EN PROCESO (limpia pago/inventario; conserva ítems y proveedor para editar).
  const { error } = await supabase
    .from('compras_directas')
    .update({
      estado: 'en_proceso', gasto: null, caja_id: null, caja_mov_id: null, pago_legs: null,
      mov_id: null, finalizada_at: null, updated_at: new Date().toISOString(),
    })
    .eq('id', compra.id);
  if (error) throw error;
}

/* ───────── Editar una compra EN PROCESO (ítems / proveedor / almacén) ───────── */

export interface EditarCompraInput {
  compra: CompraDirecta;
  lineas: LineaCompra[];
  almacen: string;
  proveedorId?: string | null;
  proveedorNombre?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Edita una compra directa EN PROCESO: reemplaza sus materiales/cantidades, almacén y
 * proveedor. No toca caja ni inventario (todavía no se finalizó). Los materiales nuevos
 * se dan de alta en inventario. Las FINALIZADAS deben reabrirse primero.
 */
export async function editarCompraDirectaEnProceso(
  input: EditarCompraInput,
  productosExistentes: Producto[] = [],
): Promise<CompraDirecta> {
  if (input.compra.estado !== 'en_proceso')
    throw new Error('Solo se puede editar una compra En proceso. Reabrí la compra primero.');
  const almacen = input.almacen.trim() || 'General';
  const lineas = input.lineas.filter((l) => (Number(l.cantidad) || 0) > 0);
  if (!lineas.length) throw new Error('Agregá al menos un material con cantidad.');

  const items: CompraDirectaItem[] = [];
  for (const l of lineas) {
    const cantidad = Number(l.cantidad) || 0;
    if (l.modo === 'existente') {
      if (!l.productoId) throw new Error('Elegí el material en cada renglón.');
      const p = productosExistentes.find((x) => x.id === l.productoId) ?? null;
      const nuevaUnidad = (l.unidad ?? '').trim();
      if (p && nuevaUnidad && nuevaUnidad !== (p.unidad ?? '')) {
        await updateProducto(p.id, { unidad: nuevaUnidad });
        p.unidad = nuevaUnidad;
      }
      items.push({ producto_id: l.productoId, producto_nombre: p?.nombre ?? '', producto_sku: p?.sku ?? null, cantidad });
    } else {
      const nom = l.nombre.trim().toUpperCase();
      if (!nom) throw new Error('Indicá el nombre del material nuevo.');
      const nuevo = await createProducto({
        sku: await nextSku(l.categoria, productosExistentes),
        nombre: nom, categoria: l.categoria, unidad: l.unidad,
        stock: 0, stock_min: 0, precio: 0, almacen, estado: 'activo',
      });
      productosExistentes = [...productosExistentes, nuevo];
      items.push({ producto_id: nuevo.id, producto_nombre: nuevo.nombre, producto_sku: nuevo.sku, cantidad });
    }
  }

  const totalCantidad = items.reduce((a, i) => a + i.cantidad, 0);
  const resumen = items.length === 1 ? items[0].producto_nombre : `${items.length} materiales`;

  const { data, error } = await supabase
    .from('compras_directas')
    .update({
      producto_id: items.length === 1 ? items[0].producto_id : null,
      producto_nombre: resumen,
      producto_sku: items.length === 1 ? items[0].producto_sku : null,
      almacen,
      cantidad: totalCantidad,
      items,
      proveedor_id: input.proveedorId ?? null,
      proveedor_nombre: input.proveedorNombre?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.compra.id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/* ───────── NUEVO FLUJO: montar (Por pagar) → Tesorería paga (Finalizada) ───────── */

export interface EnviarCompraAPagarInput {
  compra: CompraDirecta;
  /** Materiales con su monto (precio por renglón) ya cargados por el analista. */
  items: CompraDirectaItem[];
  actor: string;
  actorName?: string | null;
}

/**
 * El analista MONTA la compra con la factura y los montos y la deja "Por pagar":
 * fija los montos por material y el total, y pasa a estado `por_pagar`. NO mueve caja
 * ni inventario (eso lo hace Tesorería al pagar). La factura se sube aparte (adjuntos).
 */
export async function enviarCompraAPagar(input: EnviarCompraAPagarInput): Promise<void> {
  const { compra } = input;
  if (compra.estado === 'finalizada') throw new Error('Esta compra ya fue pagada.');
  const items = input.items.map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('La compra no tiene materiales.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('Cargá los montos de los materiales.');

  const { error } = await supabase
    .from('compras_directas')
    .update({
      estado: 'por_pagar', gasto: total, items,
      enviada_pagar_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', compra.id);
  if (error) throw error;
}

export interface PagarCompraInput {
  compra: CompraDirecta;
  /** Caja de Tesorería de la que sale el dinero. */
  cajaId: string;
  legs?: PagoLeg[];
  /** Categoría/subcategoría de gasto que coloca Tesorería al pagar. */
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * TESORERÍA PAGA una compra que estaba "Por pagar": descuenta el total de la caja
 * elegida (egreso en Tesorería con su categoría/subcategoría de gasto), da ENTRADA al
 * inventario de cada material (costo = monto ÷ cantidad → PMP) y la marca FINALIZADA,
 * dejando el comprobante de pago (quién pagó, cuándo, de qué caja) para que lo vea el analista.
 */
export async function pagarCompraDirecta(input: PagarCompraInput): Promise<void> {
  const { compra } = input;
  if (compra.estado === 'finalizada') throw new Error('Esta compra ya fue pagada.');
  if (!input.cajaId) throw new Error('Elegí la caja de la que sale el dinero.');
  const items = (compra.items ?? []).map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('La compra no tiene materiales.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('La compra no tiene montos cargados.');

  // 1) Egreso de la caja (valida saldo) → Tesorería / Libro Mayor.
  const concepto = `Compra directa · ${compra.codigo ?? compra.producto_nombre}`;
  const legs = (input.legs ?? []).filter((l) => Number(l.monto) > 0);
  let movCajaId: string;
  if (legs.length) {
    let primero: string | null = null;
    for (const leg of legs) {
      const r = await egresarDivisa({
        cajaId: input.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, categoria: 'compra_directa',
        gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
        actor: input.actor, actorName: input.actorName ?? null,
      });
      if (!primero) primero = r.id;
    }
    if (!primero) throw new Error('Indicá cuánto pagar en al menos una moneda.');
    movCajaId = primero;
  } else {
    const movCaja = await egresarGastoCaja({
      cajaId: input.cajaId, monto: total, concepto, categoria: 'compra_directa',
      gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
      actor: input.actor, actorName: input.actorName ?? null,
    });
    movCajaId = movCaja.id;
  }

  // 2) Entrada al inventario por cada material (costo = monto / cantidad).
  let primerMov: string | null = null;
  for (const it of items) {
    const cantidad = Number(it.cantidad) || 0;
    if (cantidad <= 0 || !it.producto_id) continue;
    const costoUnit = (it.gasto || 0) > 0 ? Math.round(((it.gasto || 0) / cantidad) * 10000) / 10000 : 0;
    const mov = await registrarMovimiento({
      producto_id: it.producto_id, tipo: 'entrada', delta: cantidad, almacen: compra.almacen,
      actor: input.actor, actor_name: input.actorName ?? null,
      ref_tipo: 'compra_directa', ref_id: compra.id,
      detalle: `Compra directa · ${it.producto_nombre}`, precio_unitario: costoUnit,
    });
    if (!primerMov) primerMov = mov.id;
  }

  // 3) Finalizar + comprobante de pago.
  const { error } = await supabase
    .from('compras_directas')
    .update({
      estado: 'finalizada', gasto: total, items,
      caja_id: input.cajaId, caja_mov_id: movCajaId, pago_legs: legs.length ? legs : null,
      gasto_categoria: input.gastoCategoria ?? null, gasto_subcategoria: input.gastoSubcategoria ?? null,
      mov_id: primerMov,
      pagada_at: new Date().toISOString(), pagada_por: input.actor, pagada_por_name: input.actorName ?? null,
      finalizada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', compra.id);
  if (error) throw error;
}
