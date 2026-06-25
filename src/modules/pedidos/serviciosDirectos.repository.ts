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
import { egresarGastoCaja } from '@/modules/salidas/cajas.repository';
import { egresarDivisa } from '@/modules/tesoreria/cajaSaldos.repository';
import type { CuentaCaja } from '@/shared/lib/types';

/** Pata de pago multimoneda: cuánto sale de cada (cuenta, moneda) de la caja. */
export interface PagoLeg { cuenta: CuentaCaja; moneda: string; monto: number; }

const BUCKET = 'servicios-directos';

export type EstadoServicioDirecto = 'en_proceso' | 'finalizada';

export interface ServicioDirectoItem {
  /** Descripción del servicio (texto libre). */
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
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
  estado: EstadoServicioDirecto;
  gasto: number | null;
  caja_id: string | null;
  caja_mov_id: string | null;
  adjunto_path: string | null;
  adjunto_nombre: string | null;
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

/** Servicios directos casados a un equipo de Maquinaria (para su historial). */
export async function listServiciosDirectosDeEquipo(equipoId: string): Promise<ServicioDirecto[]> {
  if (!equipoId) return [];
  const { data, error } = await supabase
    .from('servicios_directos')
    .select('*')
    .eq('equipo_id', equipoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
}

/* ───────── Alta (varios servicios) ───────── */

export interface LineaServicio { descripcion: string; cantidad: number; unidad?: string | null }

export interface CrearServicioDirectoInput {
  lineas: LineaServicio[];
  proveedorId?: string | null;
  proveedorNombre?: string | null;
  equipoId?: string | null;
  equipoNombre?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Crea un servicio directo EN PROCESO con uno o varios servicios (sin monto). */
export async function crearServicioDirecto(input: CrearServicioDirectoInput): Promise<ServicioDirecto> {
  const lineas = input.lineas
    .map((l) => ({ descripcion: l.descripcion.trim(), cantidad: Number(l.cantidad) || 0, unidad: (l.unidad ?? '').trim() || null }))
    .filter((l) => l.descripcion && l.cantidad > 0);
  if (!lineas.length) throw new Error('Agregá al menos un servicio con cantidad.');

  const items: ServicioDirectoItem[] = lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad }));
  const resumen = items.length === 1 ? items[0].descripcion : `${items.length} servicios`;
  const codigo = await nextCodigoServicioDirecto();

  const { data, error } = await supabase
    .from('servicios_directos')
    .insert({
      codigo,
      descripcion: resumen,
      items,
      proveedor_id: input.proveedorId ?? null,
      proveedor_nombre: input.proveedorNombre?.trim() || null,
      equipo_id: input.equipoId ?? null,
      equipo_nombre: input.equipoNombre?.trim() || null,
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
      adjunto_path: adjuntoPath, adjunto_nombre: adjuntoNombre,
      finalizada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .eq('id', servicio.id);
  if (error) throw error;
}
