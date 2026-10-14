/* ============================================================
   Golden Touch · Choferes / Conductores · Datos (Supabase)
   (traído de MGG el 13/10/2026; en GT sin pagos ni viáticos)

   choferes_conductores → expediente (1 por ficha de `personal`)
   choferes_viajes      → orden de ruta VJ-AAAA-NNNN
   choferes_documentos  → licencia, certificado médico, seguro… con histórico
   vehiculos_catalogo   → la flota (compartida con Asignaciones)
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import { mensajeError } from '@/shared/lib/errores';
import type { Personal } from '@/shared/lib/types';
import type { VehiculoCatalogo } from '@/modules/asignaciones/vehiculosCatalogo';
import { hoyVE, type Parada, type TipoViaje } from './choferes';
import { mensajeErrorDocumento, nombreSeguro, validarArchivoDocumento } from './archivosChofer';

const T_CONDUCTORES = 'choferes_conductores';
const T_VIAJES = 'choferes_viajes';
const T_FLOTA = 'vehiculos_catalogo';
const T_DOCS = 'choferes_documentos';
/** Bucket privado del módulo (lee quien ve Choferes; sube quien escribe). */
const BUCKET_DOCS = 'choferes-documentos';

export const TABLAS_CHOFERES = [T_CONDUCTORES, T_VIAJES, T_DOCS, T_FLOTA, 'personal', 'rrhh_descansos', 'choferes_descansos_config'];

/* ───────────── Tipos ───────────── */

export interface Conductor {
  id: string;
  /** Ficha de RRHH. null = chofer EXTERNO (no está en la nómina; se le paga por fuera, 14/10/2026). */
  personal_id: string | null;
  /** Chofer externo: nombre y apellido, cédula, teléfono y empresa (o dueño) para la que trabaja. */
  nombre: string | null;
  cedula: string | null;
  telefono: string | null;
  empresa: string | null;
  licencia_grado: string | null;
  licencia_numero: string | null;
  licencia_vence: string | null;
  certificado_medico_vence: string | null;
  seguro_vence: string | null;
  observaciones: string | null;
  activo: boolean;
  created_by: string | null;
  actor_name: string | null;
  created_at: string;
  updated_at: string | null;
  /** Se pega en el cliente desde `personal`. */
  personal?: Personal | null;
}

export interface Viaje {
  id: string;
  numero: string;
  chofer_id: string;
  vehiculo_id: string | null;
  origen: string;
  destino: string;
  paradas: Parada[];
  carga: string | null;
  fecha_salida: string;
  llegada_prevista: string | null;
  salida_real_at: string | null;
  llegada_real_at: string | null;
  km_salida: number | null;
  km_llegada: number | null;
  estado: 'programado' | 'en_ruta' | 'finalizado' | 'cancelado';
  /** camion = orden de ruta; volqueta = registro diario con la cantidad de viajes (14/10/2026). */
  tipo_viaje: TipoViaje;
  /** Cuántos viajes hizo con ese material y esa ruta. */
  cantidad_viajes: number;
  /** Empresa para la que se hizo (planilla de camión). */
  empresa: string | null;
  nota: string | null;
  created_by: string | null;
  actor_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Un vehículo del catálogo con sus datos de flota. */
export interface VehiculoFlota extends VehiculoCatalogo {
  /** operativo · taller · inactivo. */
  estado_flota?: 'operativo' | 'taller' | 'inactivo' | null;
  /** Vencimiento del seguro / RCV del vehículo. */
  seguro_vence?: string | null;
  /** Capacidad de carga en texto libre: «30 t», «12 m³», «15 pasajeros». */
  capacidad?: string | null;
}

/* ───────────── Errores ───────────── */

/** La base todavía no tiene las tablas del módulo. */
export function esTablaFaltante(e: unknown): boolean {
  const o = (e ?? {}) as { code?: string; message?: string };
  const m = String(o.message ?? '');
  return o.code === '42P01' || o.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(m);
}

function err(e: unknown, respaldo: string): Error {
  if (esTablaFaltante(e)) return new Error('El módulo de Choferes todavía no está instalado en la base.');
  const o = (e ?? {}) as { code?: string; message?: string };
  if (o.code === '42501' || /row-level security|permission denied/i.test(String(o.message ?? ''))) {
    return new Error('Tu usuario no tiene permiso de escritura en Choferes / Conductores.');
  }
  return new Error(mensajeError(e, respaldo));
}

const limpio = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim() || null;

/* ───────────── Conductores ───────────── */

export async function listConductores(): Promise<Conductor[]> {
  const { data, error } = await supabase.from(T_CONDUCTORES).select('*').order('created_at');
  if (error) throw err(error, 'No se pudieron cargar los conductores.');
  return (data ?? []) as Conductor[];
}

/** ¿Es un chofer externo (fuera de la nómina)? */
export const esExterno = (c: Pick<Conductor, 'personal_id'>) => !c.personal_id;

export interface DatosExterno {
  nombre: string;
  cedula?: string | null;
  telefono?: string | null;
  empresa?: string | null;
}

export interface ConductorInput {
  /** Ficha de RRHH; si no viene, va `externo`. */
  personal_id?: string | null;
  externo?: DatosExterno | null;
  licencia_grado?: string | null;
  licencia_numero?: string | null;
  licencia_vence?: string | null;
  certificado_medico_vence?: string | null;
  seguro_vence?: string | null;
  observaciones?: string | null;
}

function filaExterno(x: DatosExterno) {
  const nombre = limpio(x.nombre)?.toUpperCase() ?? '';
  if (nombre.length < 3) throw new Error('Escribe el nombre y apellido del chofer externo.');
  return {
    nombre,
    cedula: limpio(x.cedula)?.toUpperCase() ?? null,
    telefono: limpio(x.telefono),
    empresa: limpio(x.empresa)?.toUpperCase() ?? null,
  };
}

function filaConductor(i: Omit<ConductorInput, 'personal_id' | 'externo'>) {
  return {
    licencia_grado: limpio(i.licencia_grado)?.toUpperCase() ?? null,
    licencia_numero: limpio(i.licencia_numero),
    licencia_vence: i.licencia_vence || null,
    certificado_medico_vence: i.certificado_medico_vence || null,
    seguro_vence: i.seguro_vence || null,
    observaciones: limpio(i.observaciones),
  };
}

export async function crearConductor(i: ConductorInput, actor: string, actorName: string | null): Promise<Conductor> {
  if (!i.personal_id && !i.externo) throw new Error('Elige la ficha del trabajador o marca que es un chofer externo.');
  const quien = i.personal_id ? { personal_id: i.personal_id } : { personal_id: null, ...filaExterno(i.externo!) };
  const { data, error } = await supabase.from(T_CONDUCTORES)
    .insert({ ...quien, ...filaConductor(i), created_by: actor, actor_name: actorName })
    .select('*').single();
  if (error) throw err(error, error.code === '23505'
    ? (i.personal_id ? 'Esa persona ya tiene expediente de conductor.' : 'Ya hay un chofer externo con esa cédula.')
    : 'No se pudo guardar el conductor.');
  return data as Conductor;
}

export async function editarConductor(id: string, i: Omit<ConductorInput, 'personal_id'>): Promise<void> {
  const { error } = await supabase.from(T_CONDUCTORES).update({ ...filaConductor(i), ...(i.externo ? filaExterno(i.externo) : {}) }).eq('id', id);
  if (error) throw err(error, error.code === '23505' ? 'Ya hay un chofer externo con esa cédula.' : 'No se pudo guardar el expediente.');
}

/**
 * Borra el expediente del conductor con sus viajes y sus documentos (primero los
 * archivos: desde la base no se pueden borrar archivos del Storage). La ficha de
 * RRHH y sus descansos no se tocan.
 */
export async function eliminarConductor(id: string): Promise<void> {
  const { data: docs } = await supabase.from(T_DOCS).select('path').eq('chofer_id', id);
  const paths = (docs ?? []).map((d) => d.path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET_DOCS).remove(paths).catch(() => undefined);
  const { error: ev } = await supabase.from(T_VIAJES).delete().eq('chofer_id', id);
  if (ev) throw err(ev, 'No se pudieron borrar los viajes del conductor.');
  const { data, error } = await supabase.from(T_CONDUCTORES).delete().eq('id', id).select('id');
  if (error) throw err(error, 'No se pudo eliminar el conductor.');
  if (!data?.length) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

export async function setConductorActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(T_CONDUCTORES).update({ activo }).eq('id', id);
  if (error) throw err(error, 'No se pudo cambiar el estado del conductor.');
}

/** ¿La ficha de RRHH dice que maneja? (cargo CONDUCTOR, CHOFER, AYUDANTE GENERAL CONDUCTOR…) */
export function esCargoDeChofer(p: Pick<Personal, 'cargo' | 'departamento'>): boolean {
  const t = `${p.cargo ?? ''} ${p.departamento ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /chofer|conductor|transport/.test(t);
}

/** Crea el expediente (vacío) de todo el personal activo con cargo de chofer que todavía no lo tiene. */
export async function importarConductoresDesdeRrhh(personal: Personal[], existentes: Conductor[], actor: string, actorName: string | null): Promise<number> {
  const ya = new Set(existentes.map((c) => c.personal_id));
  const nuevos = personal.filter((p) => p.activo && esCargoDeChofer(p) && !ya.has(p.id));
  if (!nuevos.length) return 0;
  const { error } = await supabase.from(T_CONDUCTORES).insert(nuevos.map((p) => ({
    personal_id: p.id, created_by: actor, actor_name: actorName,
    observaciones: 'Expediente creado desde la ficha de RRHH; completar licencia, certificado médico y seguro.',
  })));
  if (error) throw err(error, 'No se pudieron traer los conductores de RRHH.');
  return nuevos.length;
}

/* ───────────── Flota (catálogo de vehículos) ───────────── */

export async function listFlota(): Promise<VehiculoFlota[]> {
  const { data, error } = await supabase.from(T_FLOTA).select('*').order('marca').order('modelo').order('placa');
  if (error) throw err(error, 'No se pudo leer la flota.');
  return (data ?? []) as VehiculoFlota[];
}

export interface VehiculoInput {
  placa: string;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  color?: string | null;
  serial_carroceria?: string | null;
  serial_motor?: string | null;
  notas?: string | null;
  activo?: boolean;
  estado_flota?: 'operativo' | 'taller' | 'inactivo' | null;
  seguro_vence?: string | null;
  capacidad?: string | null;
}

/** Placa como se guarda: mayúsculas, sin espacios ni guiones. */
export function normalizarPlaca(p: string | null | undefined): string {
  return String(p ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

function filaVehiculo(v: VehiculoInput) {
  const placa = normalizarPlaca(v.placa);
  if (!placa) throw new Error('Indica la placa del vehículo.');
  if (!limpio(v.marca) && !limpio(v.modelo)) throw new Error('Indica al menos la marca o el modelo.');
  if (v.anio != null && (!Number.isInteger(v.anio) || v.anio < 1950 || v.anio > 2100)) throw new Error('El año no es válido.');
  const up = (s: unknown) => limpio(s)?.toUpperCase() ?? null;
  return {
    placa,
    tipo: up(v.tipo) ?? 'VEHÍCULO',
    marca: up(v.marca),
    modelo: up(v.modelo),
    anio: v.anio ?? null,
    color: up(v.color),
    serial_carroceria: up(v.serial_carroceria),
    serial_motor: up(v.serial_motor),
    observacion: limpio(v.notas),
    activo: v.activo ?? true,
    updated_at: new Date().toISOString(),
    ...(v.estado_flota !== undefined ? { estado_flota: v.estado_flota ?? 'operativo' } : {}),
    ...(v.seguro_vence !== undefined ? { seguro_vence: v.seguro_vence || null } : {}),
    ...(v.capacidad !== undefined ? { capacidad: limpio(v.capacidad) } : {}),
  };
}

export async function crearVehiculo(v: VehiculoInput, actor: string): Promise<VehiculoFlota> {
  const { data, error } = await supabase.from(T_FLOTA).insert({ ...filaVehiculo(v), created_by: actor }).select('*').single();
  if (error) throw err(error, error.code === '23505' ? `Ya hay un vehículo con la placa ${normalizarPlaca(v.placa)}.` : 'No se pudo guardar el vehículo.');
  return data as VehiculoFlota;
}

export async function editarVehiculo(id: string, v: VehiculoInput, actor: string): Promise<VehiculoFlota> {
  const { data, error } = await supabase.from(T_FLOTA).update({ ...filaVehiculo(v), updated_by: actor }).eq('id', id).select('*').single();
  if (error) throw err(error, error.code === '23505' ? `Ya hay un vehículo con la placa ${normalizarPlaca(v.placa)}.` : 'No se pudo guardar el vehículo.');
  return data as VehiculoFlota;
}

/** Borra el vehículo del catálogo. Sus viajes quedan sin vehículo; si está en Asignaciones no se deja. */
export async function eliminarVehiculo(id: string): Promise<void> {
  const { data, error } = await supabase.from(T_FLOTA).delete().eq('id', id).select('id');
  if (error) {
    if (error.code === '23503') throw new Error('Ese vehículo está en Asignaciones y no se puede borrar. Dalo de baja desmarcando «En el catálogo».');
    throw err(error, 'No se pudo eliminar el vehículo.');
  }
  if (!data?.length) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

/* ───────────── Viajes ───────────── */

function normViaje(v: Record<string, unknown>): Viaje {
  return {
    ...(v as unknown as Viaje),
    paradas: Array.isArray(v.paradas) ? (v.paradas as Parada[]) : [],
    km_salida: v.km_salida == null ? null : Number(v.km_salida),
    km_llegada: v.km_llegada == null ? null : Number(v.km_llegada),
    tipo_viaje: v.tipo_viaje === 'volqueta' ? 'volqueta' : 'camion',
    cantidad_viajes: Math.max(1, Number(v.cantidad_viajes) || 1),
    empresa: (v.empresa as string | null) ?? null,
  };
}

/** Todos los viajes, del más reciente al más viejo (por páginas: la tabla crece todos los días). */
export async function listViajes(): Promise<Viaje[]> {
  try {
    const filas = await todasLasFilas<Record<string, unknown>>((d, h) =>
      supabase.from(T_VIAJES).select('*').order('fecha_salida', { ascending: false }).order('id').range(d, h));
    return filas.map(normViaje);
  } catch (e) { throw err(e, 'No se pudieron cargar los viajes.'); }
}

export interface ViajeInput {
  chofer_id: string;
  vehiculo_id?: string | null;
  origen: string;
  destino: string;
  paradas?: Parada[];
  carga?: string | null;
  fecha_salida: string;
  llegada_prevista?: string | null;
  nota?: string | null;
  /** Cuántos viajes (1 si no se indica). */
  cantidad_viajes?: number | null;
  empresa?: string | null;
  /** Viaje ya realizado: entra directo como finalizado con sus horas y km reales. */
  realizado?: ViajeRealizado | null;
}

export interface ViajeRealizado {
  salida_real_at: string;
  llegada_real_at: string;
  km_salida?: number | null;
  km_llegada?: number | null;
}

function cantidadValida(n: number | null | undefined): number {
  const c = n == null ? 1 : Number(n);
  if (!Number.isInteger(c) || c < 1 || c > 999) throw new Error('La cantidad de viajes tiene que ser un número entero entre 1 y 999.');
  return c;
}

function filaViaje(i: ViajeInput) {
  if (!i.chofer_id) throw new Error('Elige el chofer.');
  if (!limpio(i.origen) || !limpio(i.destino)) throw new Error('Indica el origen y el destino de la ruta.');
  if (!i.fecha_salida) throw new Error('Indica la fecha y hora de salida.');
  const r = i.realizado ?? null;
  if (r) {
    if (!r.llegada_real_at) throw new Error('Indica la fecha y hora de llegada del viaje.');
    if (new Date(r.llegada_real_at) < new Date(r.salida_real_at || i.fecha_salida)) throw new Error('La llegada no puede ser antes de la salida.');
    if (new Date(r.llegada_real_at) > new Date()) throw new Error('Un viaje ya realizado no puede terminar en el futuro.');
    if (r.km_salida != null && r.km_llegada != null && r.km_llegada < r.km_salida) throw new Error('El kilometraje de llegada no puede ser menor que el de salida.');
  }
  const llegadaReal = r ? new Date(r.llegada_real_at).toISOString() : null;
  // En un viaje ya realizado las paradas quedan cumplidas (a la hora de llegada) salvo que traigan su propia hora.
  const paradas = (i.paradas ?? []).map((p) => ({ lugar: limpio(p.lugar) ?? '', nota: limpio(p.nota), hecha_at: p.hecha_at ?? llegadaReal })).filter((p) => p.lugar);
  const realizado = r ? {
    estado: 'finalizado' as const,
    salida_real_at: new Date(r.salida_real_at || i.fecha_salida).toISOString(),
    llegada_real_at: llegadaReal,
    km_salida: r.km_salida ?? null,
    km_llegada: r.km_llegada ?? null,
  } : {};
  return {
    ...realizado,
    chofer_id: i.chofer_id,
    vehiculo_id: i.vehiculo_id || null,
    origen: limpio(i.origen),
    destino: limpio(i.destino),
    paradas,
    carga: limpio(i.carga),
    tipo_viaje: 'camion' as const,
    cantidad_viajes: cantidadValida(i.cantidad_viajes),
    empresa: limpio(i.empresa)?.toUpperCase() ?? null,
    fecha_salida: new Date(i.fecha_salida).toISOString(),
    llegada_prevista: i.llegada_prevista ? new Date(i.llegada_prevista).toISOString() : null,
    nota: limpio(i.nota),
  };
}

export async function crearViaje(i: ViajeInput, actor: string, actorName: string | null): Promise<Viaje> {
  const { data, error } = await supabase.from(T_VIAJES).insert({ ...filaViaje(i), created_by: actor, actor_name: actorName }).select('*').single();
  if (error) throw errorEnRuta(error, 'No se pudo crear la orden de ruta.');
  return normViaje(data as Record<string, unknown>);
}

/** Programado, en ruta o finalizado se corrigen (un cancelado no). */
export async function editarViaje(id: string, i: ViajeInput): Promise<void> {
  const { data, error } = await supabase.from(T_VIAJES).update(filaViaje(i)).eq('id', id)
    .in('estado', ['programado', 'en_ruta', 'finalizado']).select('id');
  if (error) throw errorEnRuta(error, 'No se pudo guardar la orden de ruta.');
  if (!data?.length) throw new Error('Ese viaje ya no se puede corregir (está cancelado o no existe).');
}

/* ── Viajes de volqueta: registro del día (chofer, vehículo, material, origen, destino, fecha, viajes) ── */

export interface VolquetaInput {
  chofer_id: string;
  vehiculo_id?: string | null;
  /** Material: escombros, cabilla, arena… */
  carga: string;
  origen: string;
  destino: string;
  /** AAAA-MM-DD. */
  fecha: string;
  cantidad_viajes: number;
  nota?: string | null;
}

function filaVolqueta(i: VolquetaInput) {
  if (!i.chofer_id) throw new Error('Elige el chofer.');
  if (!limpio(i.carga)) throw new Error('Indica el material.');
  if (!limpio(i.origen) || !limpio(i.destino)) throw new Error('Indica el origen y el destino.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.fecha ?? '')) throw new Error('Indica la fecha.');
  if (i.fecha > hoyVE()) throw new Error('La fecha no puede ser futura.');
  // Mediodía en Venezuela (UTC-4): la fecha no se corre de día en ningún huso.
  const momento = new Date(`${i.fecha}T12:00:00-04:00`).toISOString();
  return {
    tipo_viaje: 'volqueta' as const,
    estado: 'finalizado' as const,
    chofer_id: i.chofer_id,
    vehiculo_id: i.vehiculo_id || null,
    carga: limpio(i.carga)?.toUpperCase() ?? null,
    origen: limpio(i.origen)?.toUpperCase() ?? '',
    destino: limpio(i.destino)?.toUpperCase() ?? '',
    cantidad_viajes: cantidadValida(i.cantidad_viajes),
    fecha_salida: momento, salida_real_at: momento, llegada_real_at: momento,
    llegada_prevista: null, km_salida: null, km_llegada: null, paradas: [],
    nota: limpio(i.nota),
  };
}

export async function crearViajeVolqueta(i: VolquetaInput, actor: string, actorName: string | null): Promise<Viaje> {
  const { data, error } = await supabase.from(T_VIAJES).insert({ ...filaVolqueta(i), created_by: actor, actor_name: actorName }).select('*').single();
  if (error) throw err(error, 'No se pudieron registrar los viajes.');
  return normViaje(data as Record<string, unknown>);
}

export async function editarViajeVolqueta(id: string, i: VolquetaInput): Promise<void> {
  const { data, error } = await supabase.from(T_VIAJES).update(filaVolqueta(i)).eq('id', id).eq('tipo_viaje', 'volqueta').select('id');
  if (error) throw err(error, 'No se pudo guardar.');
  if (!data?.length) throw new Error('Ese registro ya no existe.');
}

/** Borra un viaje (cualquier estado). */
export async function eliminarViaje(id: string): Promise<void> {
  const { data, error } = await supabase.from(T_VIAJES).delete().eq('id', id).select('id');
  if (error) throw err(error, 'No se pudo eliminar el viaje.');
  if (!data?.length) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

function errorEnRuta(e: { code?: string; message?: string }, respaldo: string): Error {
  if (e.code === '23505' && /chofer_en_ruta/.test(e.message ?? '')) return new Error('Ese chofer ya está en ruta en otro viaje. Finaliza ese viaje primero.');
  if (e.code === '23505' && /vehiculo_en_ruta/.test(e.message ?? '')) return new Error('Ese vehículo ya está en ruta en otro viaje.');
  return err(e, respaldo);
}

/** Programado → en ruta. */
export async function iniciarViaje(id: string, o: { km_salida?: number | null; salida_real_at?: string | null }): Promise<void> {
  const { error } = await supabase.from(T_VIAJES).update({
    estado: 'en_ruta', km_salida: o.km_salida ?? null,
    salida_real_at: o.salida_real_at ? new Date(o.salida_real_at).toISOString() : new Date().toISOString(),
  }).eq('id', id).eq('estado', 'programado');
  if (error) throw errorEnRuta(error, 'No se pudo iniciar la ruta.');
}

/** Marca o desmarca una parada como cumplida. */
export async function guardarParadas(id: string, paradas: Parada[]): Promise<void> {
  const { error } = await supabase.from(T_VIAJES).update({ paradas }).eq('id', id);
  if (error) throw err(error, 'No se pudo guardar la parada.');
}

/** En ruta → finalizado. */
export async function finalizarViaje(id: string, o: { km_llegada?: number | null; llegada_real_at?: string | null; nota?: string | null }): Promise<void> {
  const patch: Record<string, unknown> = {
    estado: 'finalizado', km_llegada: o.km_llegada ?? null,
    llegada_real_at: o.llegada_real_at ? new Date(o.llegada_real_at).toISOString() : new Date().toISOString(),
  };
  if (o.nota !== undefined) patch.nota = limpio(o.nota);
  const { error } = await supabase.from(T_VIAJES).update(patch).eq('id', id).in('estado', ['programado', 'en_ruta']);
  if (error) throw err(error, error.code === '23514' ? 'El kilometraje de llegada no puede ser menor que el de salida.' : 'No se pudo finalizar la ruta.');
}

export async function cancelarViaje(id: string, motivo: string): Promise<void> {
  const m = limpio(motivo);
  if (!m) throw new Error('Indica el motivo de la cancelación.');
  const { data: v } = await supabase.from(T_VIAJES).select('nota').eq('id', id).maybeSingle();
  const nota = [v?.nota, `Cancelado: ${m}`].filter(Boolean).join(' · ');
  const { error } = await supabase.from(T_VIAJES).update({ estado: 'cancelado', nota }).eq('id', id).in('estado', ['programado', 'en_ruta']);
  if (error) throw err(error, 'No se pudo cancelar la ruta.');
}

/* ───────────── Documentos del conductor (con histórico) ─────────────
   Cada subida es una fila nueva; la anterior del mismo tipo queda como versión
   vieja (vigente = false) y no se borra sola: así se sabe cuándo fue la última
   vez que se subió cada papel y quién lo subió. */

export type TipoDocumentoChofer = 'licencia' | 'certificado_medico' | 'seguro' | 'otro';

export const TIPOS_DOCUMENTO_CHOFER: { key: TipoDocumentoChofer; label: string; icon: string; campoVence: 'licencia_vence' | 'certificado_medico_vence' | 'seguro_vence' | null }[] = [
  { key: 'licencia', label: 'Licencia de conducir', icon: '🪪', campoVence: 'licencia_vence' },
  { key: 'certificado_medico', label: 'Certificado médico', icon: '🩺', campoVence: 'certificado_medico_vence' },
  { key: 'seguro', label: 'Seguro', icon: '🛡', campoVence: 'seguro_vence' },
  { key: 'otro', label: 'Otros documentos', icon: '📄', campoVence: null },
];

export interface DocumentoChofer {
  id: string;
  chofer_id: string;
  tipo: TipoDocumentoChofer;
  etiqueta: string | null;
  path: string;
  nombre: string;
  mime: string | null;
  tamano: number | null;
  vence: string | null;
  vigente: boolean;
  subido_por: string | null;
  subido_por_nombre: string | null;
  created_at: string;
}

/** Todos los documentos (vigentes e históricos), del más nuevo al más viejo. */
export async function listDocumentosChofer(): Promise<DocumentoChofer[]> {
  try {
    return await todasLasFilas<DocumentoChofer>((d, h) =>
      supabase.from(T_DOCS).select('*').order('created_at', { ascending: false }).order('id').range(d, h));
  } catch (e) {
    if (esTablaFaltante(e)) throw e;
    throw err(e, 'No se pudieron cargar los documentos.');
  }
}

/**
 * Sube un documento y lo deja como el vigente de su tipo (los anteriores quedan
 * como histórico). Si trae fecha de vencimiento, actualiza también la del
 * expediente (licencia / certificado médico / seguro).
 */
export async function subirDocumentoChofer(
  c: Pick<Conductor, 'id' | 'personal_id'>,
  tipo: TipoDocumentoChofer,
  file: File,
  o: { etiqueta?: string | null; vence?: string | null; actor: string; actorName: string | null },
): Promise<DocumentoChofer> {
  const falla = validarArchivoDocumento(file);
  if (falla) throw new Error(falla);
  const etiqueta = limpio(o.etiqueta);
  if (tipo === 'otro' && !etiqueta) throw new Error('Ponle un nombre al documento (ej.: Certificado de antecedentes).');

  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `${c.personal_id ?? `externo-${c.id}`}/${tipo}/${rand}_${nombreSeguro(file.name)}`;
  const { error: errSubir } = await supabase.storage.from(BUCKET_DOCS)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (errSubir) throw new Error(mensajeErrorDocumento(errSubir));

  const { data, error } = await supabase.from(T_DOCS).insert({
    chofer_id: c.id, tipo, etiqueta, path, nombre: file.name, mime: file.type || null, tamano: file.size ?? null,
    vence: o.vence || null, vigente: true, subido_por: o.actor, subido_por_nombre: o.actorName,
  }).select('*').single();
  if (error) {
    await supabase.storage.from(BUCKET_DOCS).remove([path]).catch(() => undefined);
    throw err(error, mensajeErrorDocumento(error));
  }
  const nuevo = data as DocumentoChofer;

  // Los anteriores del mismo tipo (y, en «otros», de la misma etiqueta) pasan al histórico.
  let q = supabase.from(T_DOCS).update({ vigente: false }).eq('chofer_id', c.id).eq('tipo', tipo).neq('id', nuevo.id);
  if (tipo === 'otro') q = q.eq('etiqueta', etiqueta as string);
  await q;

  // El vencimiento del documento es el del expediente.
  const def = TIPOS_DOCUMENTO_CHOFER.find((t) => t.key === tipo);
  if (o.vence && def?.campoVence) await supabase.from(T_CONDUCTORES).update({ [def.campoVence]: o.vence }).eq('id', c.id);
  return nuevo;
}

export async function urlDocumentoChofer(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(path, 60 * 10);
  if (error) throw err(error, 'No se pudo abrir el documento.');
  return data.signedUrl;
}

/** Quita un documento (archivo y fila). Si era el vigente, el anterior del mismo tipo vuelve a serlo. */
export async function eliminarDocumentoChofer(d: DocumentoChofer): Promise<void> {
  // Primero el archivo: desde la base no se pueden borrar archivos del Storage.
  await supabase.storage.from(BUCKET_DOCS).remove([d.path]).catch(() => undefined);
  const { data, error } = await supabase.from(T_DOCS).delete().eq('id', d.id).select('id');
  if (error) throw err(error, 'No se pudo eliminar el documento.');
  if (!data?.length) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
  if (d.vigente) {
    let q = supabase.from(T_DOCS).select('id').eq('chofer_id', d.chofer_id).eq('tipo', d.tipo).order('created_at', { ascending: false }).limit(1);
    if (d.tipo === 'otro') q = q.eq('etiqueta', d.etiqueta ?? '');
    const { data: ant } = await q;
    if (ant?.[0]) await supabase.from(T_DOCS).update({ vigente: true }).eq('id', ant[0].id);
  }
}
