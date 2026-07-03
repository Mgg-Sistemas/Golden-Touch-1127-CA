/* ============================================================
   Golden Touch · Salidas / Traslados · Material (Supabase)
   Salida (descuenta stock hacia un destino) y traslado (mueve
   stock entre almacenes llevando el PMP). Reutiliza el kardex
   (`movimientos`) y la lógica de existencias por almacén.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type {
  Movimiento, EventoHistorial, SolicitudSalida, EstadoSolicitudSalida, ScopeSalida, TipoSalida, ItemSalida,
} from '@/shared/lib/types';
import { registrarMovimiento } from '@/modules/inventario/movimientos.repository';
import { getExistencia } from '@/modules/inventario/almacenes.repository';
import { findProducto } from '@/modules/inventario/inventario.repository';
import { salidaDinero, trasladoDinero } from './cajas.repository';

export interface SalidaMaterialInput {
  productoId: string;
  almacen: string;
  cantidad: number;
  destino: string;
  motivo?: string | null;
  precioUnit?: number | null;
  /** Fecha en que se entregó la salida al destino (YYYY-MM-DD). */
  fechaEntrega?: string | null;
  /** Persona que solicitó (se guarda en el movimiento para el historial). */
  solicitante?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Salida de material: descuenta stock del almacén hacia un destino. */
export async function salidaMaterial(input: SalidaMaterialInput): Promise<Movimiento> {
  const cantidad = Number(input.cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0.');
  const ex = await getExistencia(input.productoId, input.almacen);
  const stock = Number(ex?.stock) || 0;
  if (cantidad > stock) throw new Error(`Stock insuficiente en ${input.almacen}. Disponible: ${stock}.`);

  return registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'salida',
    delta: -cantidad,
    almacen: input.almacen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'salida_modulo',
    destino: input.destino || null,
    solicitante: input.solicitante ?? null,
    fecha_entrega: input.fechaEntrega || null,
    detalle: input.motivo || null,
    precio_unitario: input.precioUnit != null ? Number(input.precioUnit) : null,
  });
}

export interface TrasladoMaterialInput {
  productoId: string;
  almacenOrigen: string;
  almacenDestino: string;
  cantidad: number;
  motivo?: string | null;
  precioUnit?: number | null;
  /** Texto de la nota de entrega (se imprime en el PDF cuando está marcada). */
  notaEntrega?: string | null;
  /** Fecha en que se entregó el traslado al almacén destino (YYYY-MM-DD). */
  fechaEntrega?: string | null;
  /** Persona que solicitó (se guarda en el movimiento para el historial). */
  solicitante?: string | null;
  actor: string;
  actorName?: string | null;
}

/**
 * Traslado de material entre almacenes: salida en origen + entrada en destino
 * llevando el costo (PMP) del origen para fundirlo en el destino.
 */
export async function trasladoMaterial(input: TrasladoMaterialInput): Promise<Movimiento> {
  const cantidad = Number(input.cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor que 0.');
  if (input.almacenOrigen === input.almacenDestino) throw new Error('El almacén origen y destino deben ser distintos.');
  const exOrigen = await getExistencia(input.productoId, input.almacenOrigen);
  const stockOrigen = Number(exOrigen?.stock) || 0;
  if (cantidad > stockOrigen) throw new Error(`Stock insuficiente en ${input.almacenOrigen}. Disponible: ${stockOrigen}.`);
  // Costo que viaja al destino: el PMP del almacén de origen; si esa existencia
  // no tiene costo (0), se usa el PRECIO del producto en inventario (productos.precio).
  let costoOrigen = Number(exOrigen?.costo_promedio) || 0;
  if (costoOrigen <= 0) {
    const prod = await findProducto(input.productoId);
    costoOrigen = Number(prod?.precio) || 0;
  }
  const precio = input.precioUnit != null ? Number(input.precioUnit) : (costoOrigen || null);
  const motivo = input.motivo?.trim() || null;
  const notaEntrega = input.notaEntrega?.trim() || null;

  // Salida del origen (se devuelve este movimiento para trazar el traslado).
  const movSalida = await registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'transferencia',
    delta: -cantidad,
    almacen: input.almacenOrigen,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'traslado_modulo',
    destino: input.almacenDestino,
    solicitante: input.solicitante ?? null,
    nota_entrega: notaEntrega,
    fecha_entrega: input.fechaEntrega || null,
    detalle: motivo ? `Traslado a ${input.almacenDestino} · ${motivo}` : `Traslado a ${input.almacenDestino}`,
    precio_unitario: precio,
  });
  // Entrada al destino al costo (PMP) del origen.
  await registrarMovimiento({
    producto_id: input.productoId,
    tipo: 'transferencia',
    delta: cantidad,
    almacen: input.almacenDestino,
    actor: input.actor,
    actor_name: input.actorName ?? null,
    ref_tipo: 'traslado_modulo',
    destino: input.almacenDestino,
    solicitante: input.solicitante ?? null,
    nota_entrega: notaEntrega,
    fecha_entrega: input.fechaEntrega || null,
    detalle: motivo ? `Traslado desde ${input.almacenOrigen} · ${motivo}` : `Traslado desde ${input.almacenOrigen}`,
    precio_unitario: costoOrigen,
  });
  return movSalida;
}

/* ───────────── Directorio de personas (destino) ───────────── */

export interface PersonaDirectorio {
  id: string;
  nombre: string;
  apellido: string;
  cargo: string;
}

/** Directorio mínimo de usuarios activos (vía función SECURITY DEFINER,
 *  legible por cualquier autenticado) para elegir el destinatario persona. */
export async function listDirectorioUsuarios(): Promise<PersonaDirectorio[]> {
  const { data, error } = await supabase.rpc('directorio_usuarios');
  if (error) throw error;
  return (data ?? []) as PersonaDirectorio[];
}

/* ───────────── Listados (historial) ───────────── */

export async function listSalidasMaterial(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*, producto:productos(sku, nombre, unidad)')
    .eq('ref_tipo', 'salida_modulo')
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Movimiento[];
}

/** Traslados de material: solo el lado de salida (delta<0) para no duplicar. */
export async function listTrasladosMaterial(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*, producto:productos(sku, nombre, unidad)')
    .eq('ref_tipo', 'traslado_modulo')
    .lt('delta', 0)
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Movimiento[];
}

/* ============================================================
   Solicitudes de salida/traslado con aprobación
   El obrero crea (por_aprobar); admin/analista aprueba y ejecuta.
   Al ejecutar se reutilizan las funciones inmediatas de arriba
   (salidaMaterial/trasladoMaterial/salidaDinero/trasladoDinero).
   ============================================================ */

const SOL = 'solicitudes_salida';

function appendHistorial(s: Pick<SolicitudSalida, 'historial'>, evento: string, actor: string, meta: Record<string, unknown> = {}): EventoHistorial[] {
  const ev = { at: new Date().toISOString(), evento, actor, ...meta } as EventoHistorial;
  return [...(s.historial ?? []), ev];
}

/** Próximo código SAL-AAAA-NNNN (salida) o TRA-AAAA-NNNN (traslado). */
async function nextCodigoSolicitudSalida(scope: ScopeSalida): Promise<string> {
  const year = new Date().getFullYear();
  const prefijo = scope === 'traslado' ? 'TRA' : 'SAL';
  const { count, error } = await supabase
    .from(SOL)
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope);
  if (error) throw error;
  return `${prefijo}-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;
}

export async function listSolicitudesSalida(filtros?: {
  scope?: ScopeSalida; tipo?: TipoSalida; estado?: EstadoSolicitudSalida;
}): Promise<SolicitudSalida[]> {
  let qy = supabase.from(SOL).select('*').order('created_at', { ascending: false });
  if (filtros?.scope) qy = qy.eq('scope', filtros.scope);
  if (filtros?.tipo) qy = qy.eq('tipo', filtros.tipo);
  if (filtros?.estado) qy = qy.eq('estado', filtros.estado);
  const { data, error } = await qy;
  if (error) throw error;
  return (data ?? []) as SolicitudSalida[];
}

export interface CrearSolicitudSalidaInput {
  scope: ScopeSalida;
  tipo: TipoSalida;
  solicitante: string;
  unidadSolicitante?: string | null;
  destino?: string | null;
  motivo?: string | null;
  // transporte / formato salida en tránsito
  choferId?: string | null;
  choferNombre?: string | null;
  choferCedula?: string | null;
  vehiculoId?: string | null;
  vehiculoDescripcion?: string | null;
  vehiculoPlaca?: string | null;
  direccionDespacho?: string | null;
  direccionDestino?: string | null;
  consumoInterno?: boolean | null;
  // material
  productoId?: string | null;
  productoNombre?: string | null;
  /** Varios renglones de material en una misma solicitud (como una OC). Si se
   *  pasa, tiene prioridad sobre productoId/cantidad (que quedan como resumen). */
  items?: ItemSalida[] | null;
  almacenOrigen?: string | null;
  almacenDestino?: string | null;
  cantidad?: number | null;
  precioUnit?: number | null;
  fechaEntrega?: string | null;
  notaEntrega?: string | null;
  // dinero
  cajaId?: string | null;
  cajaDestinoId?: string | null;
  monto?: number | null;
  moneda?: string | null;
  cuenta?: string | null;
  actor: string;
  actorName?: string | null;
}

/** Normaliza los renglones de material: usa `items` si viene; si no, arma uno
 *  solo a partir de los campos sueltos (productoId/cantidad). */
function normalizarItemsSalida(input: CrearSolicitudSalidaInput): ItemSalida[] {
  const lista = (input.items ?? []).filter((i) => i && i.producto_id && (Number(i.cantidad) || 0) > 0);
  if (lista.length) {
    return lista.map((i) => ({
      producto_id: i.producto_id,
      producto_nombre: i.producto_nombre ?? '',
      producto_sku: i.producto_sku ?? null,
      unidad: i.unidad ?? null,
      cantidad: Number(i.cantidad) || 0,
      precio_unit: Number(i.precio_unit) || 0,
      almacen: i.almacen ?? null,
      observacion: i.observacion?.trim() || null,
    }));
  }
  if (input.productoId && (Number(input.cantidad) || 0) > 0) {
    return [{
      producto_id: input.productoId,
      producto_nombre: input.productoNombre ?? '',
      producto_sku: null,
      unidad: null,
      cantidad: Number(input.cantidad) || 0,
      precio_unit: Number(input.precioUnit) || 0,
      almacen: input.almacenOrigen ?? null,
    }];
  }
  return [];
}

/** Crea la solicitud en estado 'por_aprobar'. NO ejecuta el movimiento. */
export async function crearSolicitudSalida(input: CrearSolicitudSalidaInput): Promise<SolicitudSalida> {
  if (!input.solicitante.trim()) throw new Error('Indicá quién hace la solicitud.');
  let items: ItemSalida[] = [];
  if (input.tipo === 'material') {
    items = normalizarItemsSalida(input);
    if (!items.length) throw new Error('Agregá al menos un material con cantidad.');
    if (input.scope === 'traslado') {
      // El traslado mueve todo de un almacén origen a un destino (a nivel solicitud).
      if (!input.almacenOrigen) throw new Error('Indicá el almacén de origen.');
      if (!input.almacenDestino) throw new Error('Indicá el almacén destino.');
      if (input.almacenOrigen === input.almacenDestino) throw new Error('El almacén origen y destino deben ser distintos.');
    } else {
      // La salida descuenta cada material de SU almacén (el de cada renglón).
      if (items.some((i) => !i.almacen)) throw new Error('Cada material debe indicar de qué almacén sale.');
    }
    // La salida de material NO lleva destino (a quién va dirigido): solo el traslado.
  } else {
    const monto = Number(input.monto) || 0;
    if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
    if (!input.cajaId) throw new Error('Elegí la caja.');
    if (input.scope === 'traslado') {
      if (!input.cajaDestinoId) throw new Error('Elegí la caja destino.');
      if (input.cajaId === input.cajaDestinoId) throw new Error('La caja origen y destino deben ser distintas.');
    } else if (!input.destino?.trim()) {
      throw new Error('Indicá a quién va dirigida la salida de dinero.');
    }
  }

  // Resumen para los campos sueltos (compatibilidad con vistas/reportes que aún
  // leen producto_nombre/cantidad/precio_unit de la solicitud).
  const esMulti = input.tipo === 'material' && items.length > 0;
  const cantTotal = items.reduce((a, i) => a + i.cantidad, 0);
  const montoTotal = items.reduce((a, i) => a + i.cantidad * i.precio_unit, 0);
  const resumenNombre = items.length === 1
    ? items[0].producto_nombre
    : `${items.length} materiales`;
  const precioProm = cantTotal > 0 ? montoTotal / cantTotal : 0;
  // Almacén origen de cabecera: en traslado viene de la solicitud; en salida es
  // el almacén común de los renglones (o null si salen de varios distintos).
  const almacenesItems = [...new Set(items.map((i) => i.almacen).filter(Boolean))] as string[];
  const almacenOrigenCab = input.scope === 'traslado'
    ? (input.almacenOrigen ?? null)
    : (almacenesItems.length === 1 ? almacenesItems[0] : (input.almacenOrigen ?? null));

  const codigo = await nextCodigoSolicitudSalida(input.scope);
  const historial = appendHistorial({ historial: [] }, 'creada', input.actor);
  const { data, error } = await supabase
    .from(SOL)
    .insert({
      codigo,
      scope: input.scope,
      tipo: input.tipo,
      estado: 'por_aprobar',
      items: esMulti ? items : null,
      producto_id: esMulti ? (items.length === 1 ? items[0].producto_id : null) : (input.productoId ?? null),
      producto_nombre: esMulti ? resumenNombre : (input.productoNombre ?? null),
      almacen_origen: almacenOrigenCab,
      almacen_destino: input.almacenDestino ?? null,
      cantidad: esMulti ? cantTotal : (input.cantidad != null ? Number(input.cantidad) : null),
      precio_unit: esMulti ? precioProm : (input.precioUnit != null ? Number(input.precioUnit) : null),
      fecha_entrega: input.fechaEntrega || null,
      nota_entrega: input.notaEntrega?.trim() || null,
      caja_id: input.cajaId ?? null,
      caja_destino_id: input.cajaDestinoId ?? null,
      monto: input.monto != null ? Number(input.monto) : null,
      moneda: input.moneda ?? null,
      cuenta: input.cuenta ?? null,
      solicitante: input.solicitante.trim(),
      unidad_solicitante: input.unidadSolicitante?.trim() || null,
      destino: input.destino?.trim() || null,
      motivo: input.motivo?.trim() || null,
      chofer_id: input.choferId ?? null,
      chofer_nombre: input.choferNombre?.trim() || null,
      chofer_cedula: input.choferCedula?.trim() || null,
      vehiculo_id: input.vehiculoId ?? null,
      vehiculo_descripcion: input.vehiculoDescripcion?.trim() || null,
      vehiculo_placa: input.vehiculoPlaca?.trim() || null,
      direccion_despacho: input.direccionDespacho?.trim() || null,
      direccion_destino: input.direccionDestino?.trim() || null,
      consumo_interno: input.consumoInterno ?? false,
      historial,
      actor: input.actor,
      actor_name: input.actorName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SolicitudSalida;
}

export interface EditarSolicitudSalidaInput {
  /** Material: lista editada de renglones (cantidad / precio / observación). */
  items?: ItemSalida[] | null;
  solicitante?: string;
  unidadSolicitante?: string | null;
  destino?: string | null;
  motivo?: string | null;
  fechaEntrega?: string | null;
  notaEntrega?: string | null;
  choferNombre?: string | null;
  choferCedula?: string | null;
  vehiculoDescripcion?: string | null;
  vehiculoPlaca?: string | null;
  direccionDespacho?: string | null;
  direccionDestino?: string | null;
  consumoInterno?: boolean | null;
  /** Dinero. */
  monto?: number | null;
  actor: string;
}

/**
 * Edita una solicitud que AÚN está «por aprobar» (no ejecutada): cambia datos de
 * cabecera, transporte/direcciones y, en material, las cantidades/precios de los
 * renglones. Recalcula el resumen (producto_nombre/cantidad/precio_unit). No mueve
 * stock ni saldo: eso ocurre solo al ejecutar.
 */
export async function editarSolicitudSalida(s: SolicitudSalida, input: EditarSolicitudSalidaInput): Promise<void> {
  if (s.estado !== 'por_aprobar') throw new Error('Solo se puede editar una solicitud que está por aprobar.');

  const patch: Record<string, unknown> = {
    historial: appendHistorial(s, 'editada', input.actor),
  };
  if (input.solicitante !== undefined) {
    if (!input.solicitante.trim()) throw new Error('Indicá quién hace la solicitud.');
    patch.solicitante = input.solicitante.trim();
  }
  if (input.unidadSolicitante !== undefined) patch.unidad_solicitante = input.unidadSolicitante?.trim() || null;
  if (input.motivo !== undefined) patch.motivo = input.motivo?.trim() || null;
  if (input.fechaEntrega !== undefined) patch.fecha_entrega = input.fechaEntrega || null;
  if (input.notaEntrega !== undefined) patch.nota_entrega = input.notaEntrega?.trim() || null;
  if (input.choferNombre !== undefined) patch.chofer_nombre = input.choferNombre?.trim() || null;
  if (input.choferCedula !== undefined) patch.chofer_cedula = input.choferCedula?.trim() || null;
  if (input.vehiculoDescripcion !== undefined) patch.vehiculo_descripcion = input.vehiculoDescripcion?.trim() || null;
  if (input.vehiculoPlaca !== undefined) patch.vehiculo_placa = input.vehiculoPlaca?.trim() || null;
  if (input.direccionDespacho !== undefined) patch.direccion_despacho = input.direccionDespacho?.trim() || null;
  if (input.direccionDestino !== undefined) patch.direccion_destino = input.direccionDestino?.trim() || null;
  if (input.consumoInterno !== undefined) patch.consumo_interno = !!input.consumoInterno;

  if (s.tipo === 'material' && input.items !== undefined) {
    const items = (input.items ?? []).filter((i) => i && i.producto_id && (Number(i.cantidad) || 0) > 0);
    if (!items.length) throw new Error('La solicitud debe tener al menos un material con cantidad.');
    const cantTotal = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    const montoTotal = items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio_unit) || 0), 0);
    patch.items = items;
    patch.producto_id = items.length === 1 ? items[0].producto_id : null;
    patch.producto_nombre = items.length === 1 ? items[0].producto_nombre : `${items.length} materiales`;
    patch.cantidad = cantTotal;
    patch.precio_unit = cantTotal > 0 ? montoTotal / cantTotal : 0;
  }

  // El destino/«dirigido a»: en salida se actualiza (consumo interno fija la etiqueta).
  if (s.scope === 'salida') {
    if (input.consumoInterno) patch.destino = 'CONSUMO INTERNO';
    else if (input.destino !== undefined) patch.destino = input.destino?.trim() || null;
  }

  if (s.tipo === 'dinero' && input.monto !== undefined) {
    const monto = Number(input.monto) || 0;
    if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
    patch.monto = monto;
  }

  const { error } = await supabase.from(SOL).update(patch).eq('id', s.id);
  if (error) throw error;
}

/**
 * Edita SOLO la nota/motivo de una solicitud ya FINALIZADA (ejecutada). Es una
 * anotación adicional del usuario: NO cambia items, cantidades, montos, stock ni el
 * estado (sigue «ejecutada»). También refleja el nuevo texto en el/los movimientos
 * de esta solicitud (para que se vea en el historial y el PDF).
 */
export async function editarNotasSolicitudFinalizada(
  s: SolicitudSalida,
  input: { motivo?: string | null; notaEntrega?: string | null; actor: string },
): Promise<void> {
  if (s.estado !== 'ejecutada') throw new Error('Esta acción es solo para solicitudes finalizadas.');
  const motivo = input.motivo !== undefined ? (input.motivo?.trim() || null) : (s.motivo ?? null);
  const notaEntrega = input.notaEntrega !== undefined ? (input.notaEntrega?.trim() || null) : (s.nota_entrega ?? null);
  const patch: Record<string, unknown> = {
    motivo, nota_entrega: notaEntrega,
    historial: appendHistorial(s, 'nota_editada', input.actor, { motivo }),
  };
  const { error } = await supabase.from(SOL).update(patch).eq('id', s.id);
  if (error) throw error;
  // Reflejar la nota en los movimientos de esta solicitud (historial de Salidas).
  try {
    await supabase.from('movimientos').update({ detalle: motivo }).eq('ref_tipo', 'solicitud_salida').eq('ref_id', s.id);
  } catch { /* si el enlace no aplica, la nota igual queda en la solicitud */ }
}

/** Aprueba la solicitud (por_aprobar → aprobada). NO ejecuta el movimiento. */
export async function aprobarSolicitudSalida(s: SolicitudSalida, actor: string): Promise<void> {
  if (s.estado !== 'por_aprobar') throw new Error('Solo se aprueban solicitudes por aprobar.');
  const { error } = await supabase
    .from(SOL)
    .update({
      estado: 'aprobada',
      aprobada_por: actor,
      aprobada_en: new Date().toISOString(),
      historial: appendHistorial(s, 'aprobada', actor),
    })
    .eq('id', s.id);
  if (error) throw error;
}

/**
 * Ejecuta la solicitud aprobada: realiza el movimiento real reutilizando las
 * funciones inmediatas (que validan stock/saldo) y cierra como 'ejecutada'.
 */
export async function ejecutarSolicitudSalida(s: SolicitudSalida, actor: string, actorName?: string | null): Promise<void> {
  if (s.estado !== 'aprobada') throw new Error('Solo se ejecutan solicitudes aprobadas.');

  // Renglones de material: la solicitud puede tener varios (items) o uno solo
  // (campos sueltos). Unificamos en una lista para ejecutar todos.
  const itemsMat: ItemSalida[] = (s.items && s.items.length)
    ? s.items
    : (s.producto_id
        ? [{ producto_id: s.producto_id, producto_nombre: s.producto_nombre ?? '', producto_sku: null, unidad: null, cantidad: Number(s.cantidad) || 0, precio_unit: Number(s.precio_unit) || 0 }]
        : []);

  let movId: string | null = null;
  let movRef = '';
  if (s.scope === 'salida' && s.tipo === 'material') {
    if (!itemsMat.length) throw new Error('La solicitud no tiene materiales.');
    // Cada renglón sale de SU almacén (o del de cabecera, para solicitudes viejas).
    const almDe = (it: ItemSalida) => it.almacen || s.almacen_origen || '';
    // Pre-validación: que TODOS los renglones tengan stock antes de mover nada
    // (reduce ejecuciones a medias; la atomicidad real queda pendiente en servidor).
    for (const it of itemsMat) {
      const alm = almDe(it);
      const ex = await getExistencia(it.producto_id, alm);
      const stock = Number(ex?.stock) || 0;
      if ((Number(it.cantidad) || 0) > stock) {
        throw new Error(`Stock insuficiente de ${it.producto_nombre || 'un material'} en ${alm}. Disponible: ${stock}.`);
      }
    }
    for (const it of itemsMat) {
      const mov = await salidaMaterial({
        productoId: it.producto_id, almacen: almDe(it), cantidad: Number(it.cantidad) || 0,
        destino: s.destino || '', motivo: s.motivo, precioUnit: it.precio_unit,
        fechaEntrega: s.fecha_entrega, solicitante: s.solicitante, actor, actorName,
      });
      if (!movId) movId = mov.id;
    }
    movRef = 'salida_modulo';
  } else if (s.scope === 'traslado' && s.tipo === 'material') {
    if (!itemsMat.length) throw new Error('La solicitud no tiene materiales.');
    for (const it of itemsMat) {
      const ex = await getExistencia(it.producto_id, s.almacen_origen!);
      const stock = Number(ex?.stock) || 0;
      if ((Number(it.cantidad) || 0) > stock) {
        throw new Error(`Stock insuficiente de ${it.producto_nombre || 'un material'} en ${s.almacen_origen}. Disponible: ${stock}.`);
      }
    }
    for (const it of itemsMat) {
      const mov = await trasladoMaterial({
        productoId: it.producto_id, almacenOrigen: s.almacen_origen!, almacenDestino: s.almacen_destino!,
        cantidad: Number(it.cantidad) || 0, motivo: s.motivo, precioUnit: it.precio_unit,
        notaEntrega: s.nota_entrega, fechaEntrega: s.fecha_entrega, solicitante: s.solicitante, actor, actorName,
      });
      if (!movId) movId = mov.id;
    }
    movRef = 'traslado_modulo';
  } else if (s.scope === 'salida' && s.tipo === 'dinero') {
    const mov = await salidaDinero({
      cajaId: s.caja_id!, destino: s.destino || '', motivo: s.motivo || '',
      monto: Number(s.monto) || 0, actor, actorName,
    });
    movId = mov.id; movRef = 'salida_dinero';
  } else if (s.scope === 'traslado' && s.tipo === 'dinero') {
    const mov = await trasladoDinero({
      origenId: s.caja_id!, destinoId: s.caja_destino_id!, monto: Number(s.monto) || 0,
      motivo: s.motivo, notaEntrega: s.nota_entrega, actor, actorName,
    });
    movId = mov.id; movRef = 'traslado_dinero';
  } else {
    throw new Error('Combinación de solicitud no soportada.');
  }

  const { error } = await supabase
    .from(SOL)
    .update({
      estado: 'ejecutada',
      ejecutada_por: actor,
      ejecutada_en: new Date().toISOString(),
      mov_id: movId,
      mov_ref: movRef,
      historial: appendHistorial(s, 'ejecutada', actor),
    })
    .eq('id', s.id);
  if (error) throw error;
}

export async function cancelarSolicitudSalida(s: SolicitudSalida, actor: string, motivo: string): Promise<void> {
  if (s.estado === 'ejecutada') throw new Error('No se puede cancelar una solicitud ya ejecutada.');
  const { error } = await supabase
    .from(SOL)
    .update({
      estado: 'cancelada',
      historial: appendHistorial(s, 'cancelada', actor, { motivo }),
    })
    .eq('id', s.id);
  if (error) throw error;
}
