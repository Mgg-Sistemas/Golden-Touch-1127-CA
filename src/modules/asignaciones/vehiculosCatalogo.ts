/* ============================================================
   Golden Touch · Asignaciones · catálogo de vehículos (reglas)

   Desde el 07/10/2026 la «Asignación de vehículos» es la AUTORIZACIÓN para
   que una persona transite en ese vehículo. Los datos del vehículo (placa,
   tipo, marca, modelo, año, color, seriales) viven en un catálogo propio
   (tabla `vehiculos_catalogo`) que se agrega, edita y borra desde el módulo.
   La base no deja borrar un vehículo que ya tiene asignaciones: se marca
   inactivo y deja de ofrecerse.
   ============================================================ */
import type { Asignacion } from './asignacionesReglas';

export interface VehiculoCatalogo {
  id: string;
  placa: string;
  alias?: string | null;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  color?: string | null;
  serial_carroceria?: string | null;
  serial_motor?: string | null;
  observacion?: string | null;
  activo: boolean;
  created_at?: string;
}

export const TIPOS_VEHICULO = ['CAMIONETA', 'AUTOMÓVIL', 'CAMIÓN', 'MOTO', 'AUTOBÚS', 'VEHÍCULO', 'OTRO'];

export interface FormVehiculo {
  placa: string;
  alias: string;
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  color: string;
  serial_carroceria: string;
  serial_motor: string;
  observacion: string;
  activo: boolean;
}

export function formVehiculoVacio(): FormVehiculo {
  return { placa: '', alias: '', tipo: 'CAMIONETA', marca: '', modelo: '', anio: '', color: '', serial_carroceria: '', serial_motor: '', observacion: '', activo: true };
}

export function formVehiculoDesde(v: VehiculoCatalogo): FormVehiculo {
  return {
    placa: v.placa, alias: v.alias ?? '', tipo: v.tipo ?? '', marca: v.marca ?? '', modelo: v.modelo ?? '',
    anio: v.anio != null ? String(v.anio) : '', color: v.color ?? '', serial_carroceria: v.serial_carroceria ?? '',
    serial_motor: v.serial_motor ?? '', observacion: v.observacion ?? '', activo: v.activo,
  };
}

/** Placa como la guarda la base: mayúsculas y sin espacios. */
export const normalizarPlaca = (s: string) => String(s ?? '').toUpperCase().replace(/\s+/g, '');

/** Qué falta o está mal; `otros` es el catálogo (para no repetir la placa). */
export function erroresVehiculo(f: FormVehiculo, otros: VehiculoCatalogo[], idActual?: string | null): string[] {
  const e: string[] = [];
  const placa = normalizarPlaca(f.placa);
  if (!placa) e.push('Escribe la placa.');
  else if (otros.some((v) => v.id !== idActual && normalizarPlaca(v.placa) === placa)) e.push(`La placa ${placa} ya está en el catálogo.`);
  if (!f.marca.trim()) e.push('Indica la marca.');
  if (f.anio.trim()) {
    const a = Number(f.anio);
    if (!Number.isInteger(a) || a < 1950 || a > 2100) e.push('El año no es válido (ej.: 2015).');
  }
  return e;
}

export function payloadVehiculo(f: FormVehiculo): Record<string, unknown> {
  const t = (s: string) => s.trim() || null;
  return {
    placa: normalizarPlaca(f.placa), alias: t(f.alias), tipo: t(f.tipo), marca: t(f.marca), modelo: t(f.modelo),
    anio: f.anio.trim() ? Number(f.anio) : null, color: t(f.color), serial_carroceria: t(f.serial_carroceria),
    serial_motor: t(f.serial_motor), observacion: t(f.observacion), activo: f.activo,
  };
}

/** «TOYOTA LAND CRUISER 2015» */
export function marcaModelo(v: Pick<VehiculoCatalogo, 'marca' | 'modelo' | 'anio'>): string {
  return [v.marca, v.modelo, v.anio ? String(v.anio) : null].filter(Boolean).join(' ');
}

/** Cómo se nombra el vehículo en la asignación: su alias o «CAMIONETA TOYOTA HILUX». */
export function descripcionVehiculo(v: VehiculoCatalogo): string {
  return v.alias?.trim() || [v.tipo, v.marca, v.modelo].filter(Boolean).join(' ') || `Vehículo ${v.placa}`;
}

/** Renglón del buscador: «AB381AA · MACHITO PLATA · TOYOTA LAND CRUISER TE». */
export function etiquetaVehiculo(v: VehiculoCatalogo): string {
  return [v.placa, v.alias, marcaModelo(v), v.color].filter(Boolean).join(' · ');
}

export function filtrarVehiculos(lista: VehiculoCatalogo[], q: string): VehiculoCatalogo[] {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const t = n(q.trim());
  const orden = [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.placa.localeCompare(b.placa));
  if (!t) return orden;
  return orden.filter((v) => n([v.placa, v.alias, v.tipo, v.marca, v.modelo, v.anio, v.color, v.serial_carroceria, v.serial_motor].filter(Boolean).join(' ')).includes(t));
}

/* ───────── Vigencia de la autorización ─────────
   · vigente     → lo tiene y la fecha «autorizado hasta» no pasó (o no tiene tope);
   · vencida     → lo tiene pero el tope ya pasó: hay que renovarla o devolverlo;
   · sin_efecto  → ya se registró la devolución: la autorización no vale. */
export type VigenciaAutorizacion = 'vigente' | 'vencida' | 'sin_efecto';

export function vigenciaAutorizacion(a: Pick<Asignacion, 'estado' | 'autorizacion_hasta'>, hoy: string): VigenciaAutorizacion {
  if (a.estado !== 'asignado') return 'sin_efecto';
  if (a.autorizacion_hasta && a.autorizacion_hasta < hoy) return 'vencida';
  return 'vigente';
}

export const VIGENCIA_LABEL: Record<VigenciaAutorizacion, string> = {
  vigente: 'Autorización vigente',
  vencida: 'Autorización vencida',
  sin_efecto: 'Sin efecto (devuelto)',
};
