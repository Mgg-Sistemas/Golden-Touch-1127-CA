/* ============================================================
   Golden Touch · Servicio Directo (Supabase)
   Igual que la Compra Directa pero para SERVICIOS (mano de obra,
   mantenimientos, recargas…). NO entra a inventario. Flujo:
   EN PROCESO → FINALIZADA. Al finalizar se adjunta la factura, se
   carga el monto por servicio y la CAJA de la que sale el dinero
   (pasa por Tesorería: egreso en el Libro Mayor). Se puede vincular
   a un equipo de Control de Maquinaria para sincronizar su historial.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { egresarGastoCaja, ingresarDineroCaja } from '@/modules/salidas/cajas.repository';
import { egresarDivisa, revertirEgresoDivisa } from '@/modules/tesoreria/cajaSaldos.repository';
import type { CuentaCaja } from '@/shared/lib/types';

/** Pata de pago multimoneda: cuánto sale de cada (cuenta, moneda) de la caja. */
export interface PagoLeg { cuenta: CuentaCaja; moneda: string; monto: number; }

const BUCKET = 'servicios-directos';

export type EstadoServicioDirecto = 'en_proceso' | 'por_pagar' | 'finalizada';

export interface ServicioDirectoItem {
  /** Categoría del servicio (ej. MANTENIMIENTO DE VEHÍCULOS). */
  categoria?: string | null;
  /** Tipo de servicio (ej. «🛞 Cambio de cauchos»). */
  descripcion: string;
  /** Equipo de Control de Maquinaria casado a este renglón (opcional). */
  equipo_id?: string | null;
  equipo_nombre?: string | null;
  cantidad: number;
  unidad?: string | null;
  /** Recarga de gas/oxígeno/extintores: cantidad de bombonas y KG a recargar. */
  bombonas?: number | null;
  kg_recarga?: number | null;
  /** Monto del renglón (se carga al finalizar). */
  gasto?: number | null;
}

export interface ServicioDirecto {
  id: string;
  codigo: string | null;
  descripcion: string;
  items: ServicioDirectoItem[];
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  equipo_id: string | null;
  equipo_nombre: string | null;
  /** Quién solicitó el servicio y su unidad/área. */
  solicitante: string | null;
  unidad_solicitante: string | null;
  estado: EstadoServicioDirecto;
  gasto: number | null;
  caja_id: string | null;
  caja_mov_id: string | null;
  /** Desglose multimoneda del pago (para revertir exacto al reabrir). Null si fue caja simple. */
  pago_legs: PagoLeg[] | null;
  adjunto_path: string | null;
  adjunto_nombre: string | null;
  gasto_categoria: string | null;
  gasto_subcategoria: string | null;
  pagada_at: string | null;
  pagada_por: string | null;
  pagada_por_name: string | null;
  enviada_pagar_at: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
  finalizada_at: string | null;
  updated_at: string;
}

function normalizar(row: Record<string, unknown>): ServicioDirecto {
  const r = row as unknown as ServicioDirecto;
  const items = Array.isArray(r.items) ? r.items : [];
  return { ...r, items };
}

/** Próximo correlativo SD-AAAA-#### (Servicio Directo), atómico en la base. */
export async function nextCodigoServicioDirecto(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `sd-${year}` });
  if (error) throw error;
  const seq = String(Number(data) || 1).padStart(4, '0');
  return `SD-${year}-${seq}`;
}

export async function listServiciosDirectos(): Promise<ServicioDirecto[]> {
  const { data, error } = await supabase
    .from('servicios_directos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/** Servicios directos casados a un equipo de Maquinaria (para su historial). Toma tanto
 *  los que tienen el equipo a nivel de cabecera como los que lo tienen en algún renglón. */
export async function listServiciosDirectosDeEquipo(equipoId: string): Promise<ServicioDirecto[]> {
  if (!equipoId) return [];
  const { data, error } = await supabase
    .from('servicios_directos')
    .select('*')
    .or(`equipo_id.eq.${equipoId},items.cs.${JSON.stringify([{ equipo_id: equipoId }])}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/* ───────── Alta (varios servicios) ───────── */

export interface LineaServicio {
  categoria?: string | null;
  /** Tipo de servicio (ej. «🛞 Cambio de cauchos»). */
  descripcion: string;
  equipoId?: string | null;
  equipoNombre?: string | null;
  cantidad: number;
  bombonas?: number | null;
  kg_recarga?: number | null;
}

export interface CrearServicioDirectoInput {
  lineas: LineaServicio[];
  proveedorId?: string | null;
  proveedorNombre?: string | null;
  solicitante?: string | null;
  unidadSolicitante?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Crea un servicio directo EN PROCESO con uno o varios servicios (sin monto). */
export async function crearServicioDirecto(input: CrearServicioDirectoInput): Promise<ServicioDirecto> {
  const lineas = input.lineas
    .map((l) => ({
      categoria: (l.categoria ?? '').trim() || null,
      descripcion: l.descripcion.trim(),
      equipoId: l.equipoId ?? null,
      equipoNombre: (l.equipoNombre ?? '').trim() || null,
      cantidad: Number(l.cantidad) || 0,
      bombonas: l.bombonas != null && Number(l.bombonas) > 0 ? Number(l.bombonas) : null,
      kg_recarga: l.kg_recarga != null && Number(l.kg_recarga) > 0 ? Number(l.kg_recarga) : null,
    }))
    .filter((l) => l.descripcion && l.cantidad > 0);
  if (!lineas.length) throw new Error('Agregá al menos un servicio con cantidad.');

  const items: ServicioDirectoItem[] = lineas.map((l) => ({
    categoria: l.categoria, descripcion: l.descripcion,
    equipo_id: l.equipoId, equipo_nombre: l.equipoNombre, cantidad: l.cantidad,
    bombonas: l.bombonas, kg_recarga: l.kg_recarga,
  }));
  const resumen = items.length === 1 ? items[0].descripcion : `${items.length} servicios`;
  // Equipo de cabecera = el primero de los renglones que tenga equipo (para la columna de la lista).
  const conEquipo = lineas.find((l) => l.equipoId);
  const codigo = await nextCodigoServicioDirecto();

  const { data, error } = await supabase
    .from('servicios_directos')
    .insert({
      codigo,
      descripcion: resumen,
      items,
      proveedor_id: input.proveedorId ?? null,
      proveedor_nombre: input.proveedorNombre?.trim() || null,
      equipo_id: conEquipo?.equipoId ?? null,
      equipo_nombre: conEquipo?.equipoNombre ?? null,
      solicitante: input.solicitante?.trim() || null,
      unidad_solicitante: input.unidadSolicitante?.trim() || null,
      estado: 'en_proceso',
      actor: input.actor,
      actor_name: input.actorName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}

/** Elimina un servicio directo EN PROCESO (no movió caja). */
export async function eliminarServicioDirecto(servicio: ServicioDirecto): Promise<void> {
  if (servicio.estado !== 'en_proceso')
    throw new Error('Solo se pueden eliminar servicios directos que estén En proceso.');
  const { error } = await supabase.from('servicios_directos').delete().eq('id', servicio.id);
  if (error) throw error;
}

/* ───────── Adjunto en Storage ───────── */

export async function subirAdjuntoServicio(servicioId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${servicioId}/${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true, contentType: file.type || 'application/pdf',
  });
  if (error) throw error;
  return path;
}

export async function urlAdjuntoServicio(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

/* ───────── Completar (factura + monto + caja de Tesorería) ───────── */

export interface FinalizarServicioDirectoInput {
  servicio: ServicioDirecto;
  /** Monto por servicio (alineado con servicio.items). */
  items: ServicioDirectoItem[];
  cajaId: string;
  legs?: PagoLeg[];
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  file?: File | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Completa el servicio directo (estaba EN PROCESO): adjunta la factura, descuenta el
 * monto total de la caja elegida (egreso en Tesorería / Libro Mayor) y cierra el
 * servicio. NO toca inventario (es un servicio, no un material).
 */
export async function finalizarServicioDirecto(input: FinalizarServicioDirectoInput): Promise<void> {
  const { servicio } = input;
  if (servicio.estado !== 'en_proceso') throw new Error('Este servicio ya fue completado.');
  if (!input.cajaId) throw new Error('Elegí la caja de la que sale el dinero.');
  const items = input.items.map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('El servicio no tiene renglones.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('Indicá cuánto costó el servicio.');

  // 1) Egreso de la caja (valida saldo) → pasa por Tesorería.
  const concepto = `Servicio directo · ${servicio.codigo ?? servicio.descripcion}${servicio.equipo_nombre ? ` · ${servicio.equipo_nombre}` : ''}`;
  const legs = (input.legs ?? []).filter((l) => Number(l.monto) > 0);
  let movCajaId: string;
  if (legs.length) {
    let primero: string | null = null;
    for (const leg of legs) {
      const r = await egresarDivisa({
        cajaId: input.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, categoria: 'servicio_directo',
        gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
        actor: input.actor, actorName: input.actorName ?? null,
      });
      if (!primero) primero = r.id;
    }
    if (!primero) throw new Error('Indicá cuánto pagar en al menos una moneda.');
    movCajaId = primero;
  } else {
    const movCaja = await egresarGastoCaja({
      cajaId: input.cajaId, monto: total,
      concepto, categoria: 'servicio_directo',
      gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
      actor: input.actor, actorName: input.actorName ?? null,
    });
    movCajaId = movCaja.id;
  }

  // 2) Adjunto opcional (factura/comprobante).
  let adjuntoPath: string | null = null;
  let adjuntoNombre: string | null = null;
  if (input.file) {
    adjuntoPath = await subirAdjuntoServicio(servicio.id, input.file);
    adjuntoNombre = input.file.name;
  }

  // 3) Cerrar el servicio directo.
  const { error } = await supabase
    .from('servicios_directos')
    .update({
      estado: 'finalizada', gasto: total, items,
      caja_id: input.cajaId, caja_mov_id: movCajaId,
      pago_legs: legs.length ? legs : null,
      adjunto_path: adjuntoPath, adjunto_nombre: adjuntoNombre,
      finalizada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', servicio.id);
  if (error) throw error;
}

/* ───────── NUEVO FLUJO: montar (Por pagar) → Tesorería paga (Finalizada) ───────── */

export interface EnviarServicioAPagarInput {
  servicio: ServicioDirecto;
  /** Servicios con su monto ya cargado por el analista. */
  items: ServicioDirectoItem[];
  actor: string;
  actorName?: string | null;
}

/**
 * El analista MONTA el servicio con la factura y los montos y lo deja "Por pagar":
 * fija los montos por renglón y el total, y pasa a estado `por_pagar`. NO mueve caja
 * (eso lo hace Tesorería al pagar). La factura se sube aparte (adjuntos).
 */
export async function enviarServicioAPagar(input: EnviarServicioAPagarInput): Promise<void> {
  const { servicio } = input;
  if (servicio.estado === 'finalizada') throw new Error('Este servicio ya fue pagado.');
  const items = input.items.map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('El servicio no tiene renglones.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('Cargá los montos del servicio.');

  const { error } = await supabase
    .from('servicios_directos')
    .update({
      estado: 'por_pagar', gasto: total, items,
      enviada_pagar_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', servicio.id);
  if (error) throw error;
}

export interface PagarServicioInput {
  servicio: ServicioDirecto;
  cajaId: string;
  legs?: PagoLeg[];
  gastoCategoria?: string | null;
  gastoSubcategoria?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * TESORERÍA PAGA un servicio que estaba "Por pagar": descuenta el total de la caja
 * elegida (egreso en Tesorería con su categoría/subcategoría de gasto) y lo marca
 * FINALIZADO, dejando el comprobante de pago. NO toca inventario (es un servicio).
 */
export async function pagarServicioDirecto(input: PagarServicioInput): Promise<void> {
  const { servicio } = input;
  if (servicio.estado === 'finalizada') throw new Error('Este servicio ya fue pagado.');
  if (!input.cajaId) throw new Error('Elegí la caja de la que sale el dinero.');
  const items = (servicio.items ?? []).map((i) => ({ ...i, gasto: Math.max(0, Number(i.gasto) || 0) }));
  if (!items.length) throw new Error('El servicio no tiene renglones.');
  const total = Math.round(items.reduce((a, i) => a + (i.gasto || 0), 0) * 100) / 100;
  if (total <= 0) throw new Error('El servicio no tiene montos cargados.');

  const concepto = `Servicio directo · ${servicio.codigo ?? servicio.descripcion}${servicio.equipo_nombre ? ` · ${servicio.equipo_nombre}` : ''}`;
  const legs = (input.legs ?? []).filter((l) => Number(l.monto) > 0);
  let movCajaId: string;
  if (legs.length) {
    let primero: string | null = null;
    for (const leg of legs) {
      const r = await egresarDivisa({
        cajaId: input.cajaId, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, categoria: 'servicio_directo',
        gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
        actor: input.actor, actorName: input.actorName ?? null,
      });
      if (!primero) primero = r.id;
    }
    if (!primero) throw new Error('Indicá cuánto pagar en al menos una moneda.');
    movCajaId = primero;
  } else {
    const movCaja = await egresarGastoCaja({
      cajaId: input.cajaId, monto: total, concepto, categoria: 'servicio_directo',
      gastoCategoria: input.gastoCategoria ?? null, gastoSubcategoria: input.gastoSubcategoria ?? null,
      actor: input.actor, actorName: input.actorName ?? null,
    });
    movCajaId = movCaja.id;
  }

  const { error } = await supabase
    .from('servicios_directos')
    .update({
      estado: 'finalizada', gasto: total, items,
      caja_id: input.cajaId, caja_mov_id: movCajaId, pago_legs: legs.length ? legs : null,
      gasto_categoria: input.gastoCategoria ?? null, gasto_subcategoria: input.gastoSubcategoria ?? null,
      pagada_at: new Date().toISOString(), pagada_por: input.actor, pagada_por_name: input.actorName ?? null,
      finalizada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', servicio.id);
  if (error) throw error;
}

/* ───────── Reabrir (revertir Tesorería) ───────── */

/**
 * Reabre un servicio directo FINALIZADO: deshace el egreso de la caja (devuelve el
 * dinero a Tesorería) y lo deja EN PROCESO para editarlo y re-finalizarlo. No toca
 * inventario (es un servicio). Reversión NO atómica (deuda conocida).
 */
export async function reabrirServicioDirecto(servicio: ServicioDirecto, actor: string, actorName?: string | null): Promise<void> {
  if (servicio.estado !== 'finalizada') throw new Error('Solo se puede reabrir un servicio FINALIZADO.');

  const concepto = `Reapertura ${servicio.codigo ?? servicio.descripcion}`;
  const legs = Array.isArray(servicio.pago_legs) ? servicio.pago_legs.filter((l) => Number(l.monto) > 0) : [];
  if (legs.length) {
    for (const leg of legs) {
      await revertirEgresoDivisa({
        cajaId: servicio.caja_id!, cuenta: leg.cuenta, moneda: leg.moneda, monto: Number(leg.monto),
        concepto, actor, actorName: actorName ?? null,
      });
    }
  } else if (servicio.caja_id && (servicio.gasto || 0) > 0) {
    await ingresarDineroCaja({
      cajaId: servicio.caja_id, monto: Number(servicio.gasto), concepto, categoria: 'reverso',
      actor, actorName: actorName ?? null,
    });
  }

  const { error } = await supabase
    .from('servicios_directos')
    .update({
      estado: 'en_proceso', gasto: null, caja_id: null, caja_mov_id: null, pago_legs: null,
      finalizada_at: null, updated_at: new Date().toISOString(),
    })
    .eq('id', servicio.id);
  if (error) throw error;
}

/* ───────── Editar un servicio EN PROCESO (renglones / proveedor) ───────── */

export interface EditarServicioDirectoInput {
  servicio: ServicioDirecto;
  lineas: LineaServicio[];
  proveedorId?: string | null;
  proveedorNombre?: string | null;
  solicitante?: string | null;
  unidadSolicitante?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Edita un servicio directo EN PROCESO: reemplaza renglones y proveedor. No toca caja. */
export async function editarServicioDirectoEnProceso(input: EditarServicioDirectoInput): Promise<ServicioDirecto> {
  if (input.servicio.estado !== 'en_proceso')
    throw new Error('Solo se puede editar un servicio En proceso. Reabrí el servicio primero.');
  const lineas = input.lineas
    .map((l) => ({
      categoria: (l.categoria ?? '').trim() || null,
      descripcion: l.descripcion.trim(),
      equipoId: l.equipoId ?? null,
      equipoNombre: (l.equipoNombre ?? '').trim() || null,
      cantidad: Number(l.cantidad) || 0,
      bombonas: l.bombonas != null && Number(l.bombonas) > 0 ? Number(l.bombonas) : null,
      kg_recarga: l.kg_recarga != null && Number(l.kg_recarga) > 0 ? Number(l.kg_recarga) : null,
    }))
    .filter((l) => l.descripcion && l.cantidad > 0);
  if (!lineas.length) throw new Error('Agregá al menos un servicio con cantidad.');

  const items: ServicioDirectoItem[] = lineas.map((l) => ({
    categoria: l.categoria, descripcion: l.descripcion,
    equipo_id: l.equipoId, equipo_nombre: l.equipoNombre, cantidad: l.cantidad,
    bombonas: l.bombonas, kg_recarga: l.kg_recarga,
  }));
  const resumen = items.length === 1 ? items[0].descripcion : `${items.length} servicios`;
  const conEquipo = lineas.find((l) => l.equipoId);

  const { data, error } = await supabase
    .from('servicios_directos')
    .update({
      descripcion: resumen,
      items,
      proveedor_id: input.proveedorId ?? null,
      proveedor_nombre: input.proveedorNombre?.trim() || null,
      equipo_id: conEquipo?.equipoId ?? null,
      equipo_nombre: conEquipo?.equipoNombre ?? null,
      solicitante: input.solicitante?.trim() || null,
      unidad_solicitante: input.unidadSolicitante?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.servicio.id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizar(data as Record<string, unknown>);
}
