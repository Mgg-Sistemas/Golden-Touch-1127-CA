/* ============================================================
   Golden Touch · Choferes / Conductores · Lógica pura
   (traído de MGG el 13/10/2026; en GT sin pagos ni viáticos: rutas y descansos)

   Sin pantalla ni base, para poder probarla:
   · vigencia de documentos (licencia, certificado médico, seguro) en tres
     estados: vigente, por vencer (≤ 30 días) y vencido;
   · estado operativo de un chofer hoy: en ruta, de descanso, disponible o
     inactivo;
   · validación de un viaje ya realizado.
   ============================================================ */

import { TIPOS_VEHICULO } from '@/modules/asignaciones/vehiculosCatalogo';

export type EstadoVence = 'vigente' | 'por_vencer' | 'vencido' | 'sin_dato';

export const DIAS_AVISO_VENCE = 30;

/** Vencido, por vencer (≤ 30 días) o vigente. `hoy` en AAAA-MM-DD. */
export function estadoVence(vence: string | null | undefined, hoy: string): EstadoVence {
  if (!vence) return 'sin_dato';
  const dias = diasHasta(vence, hoy);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_AVISO_VENCE) return 'por_vencer';
  return 'vigente';
}

/** Días de `hoy` a `fecha` (negativo si ya pasó). Fechas AAAA-MM-DD en UTC. */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((aMs(fecha) - aMs(hoy)) / 86_400_000);
}

function aMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function textoEstadoVence(e: EstadoVence, vence?: string | null, hoy?: string): string {
  if (e === 'sin_dato') return 'Sin fecha';
  if (e === 'vigente') return 'Vigente';
  if (e === 'vencido') return vence && hoy ? `Vencido hace ${Math.abs(diasHasta(vence, hoy))} día(s)` : 'Vencido';
  return vence && hoy ? `Vence en ${diasHasta(vence, hoy)} día(s)` : 'Por vencer';
}

export const DOCUMENTOS_CHOFER = [
  { key: 'licencia_vence', label: 'Licencia' },
  { key: 'certificado_medico_vence', label: 'Certificado médico' },
  { key: 'seguro_vence', label: 'Seguro' },
] as const;
export type ClaveDocumentoChofer = (typeof DOCUMENTOS_CHOFER)[number]['key'];

export interface DocumentosChofer {
  licencia_vence?: string | null;
  certificado_medico_vence?: string | null;
  seguro_vence?: string | null;
}

/** Alertas de documentos de un chofer: los vencidos y los por vencer. */
export function alertasDocumentos(c: DocumentosChofer, hoy: string): { key: ClaveDocumentoChofer; label: string; estado: EstadoVence; vence: string | null }[] {
  const out: { key: ClaveDocumentoChofer; label: string; estado: EstadoVence; vence: string | null }[] = [];
  for (const d of DOCUMENTOS_CHOFER) {
    const vence = c[d.key] ?? null;
    const estado = estadoVence(vence, hoy);
    if (estado === 'vencido' || estado === 'por_vencer') out.push({ key: d.key, label: d.label, estado, vence });
  }
  return out;
}

/** El peor estado entre los tres documentos (vencido > por vencer > sin dato > vigente). */
export function peorEstadoDocumentos(c: DocumentosChofer, hoy: string): EstadoVence {
  const estados = DOCUMENTOS_CHOFER.map((d) => estadoVence(c[d.key] ?? null, hoy));
  if (estados.includes('vencido')) return 'vencido';
  if (estados.includes('por_vencer')) return 'por_vencer';
  if (estados.includes('sin_dato')) return 'sin_dato';
  return 'vigente';
}

/* ───────────── Estado operativo ───────────── */

export type EstadoChofer = 'en_ruta' | 'descanso' | 'disponible' | 'inactivo';

export const ESTADO_CHOFER: Record<EstadoChofer, { label: string; icon: string; clase: string }> = {
  en_ruta: { label: 'En ruta', icon: '🚛', clase: 'info' },
  descanso: { label: 'De descanso', icon: '🏠', clase: 'warning' },
  disponible: { label: 'Disponible', icon: '✅', clase: 'success' },
  inactivo: { label: 'Inactivo', icon: '⛔', clase: 'danger' },
};

/**
 * Qué está haciendo hoy un chofer. En ruta manda sobre el descanso: si salió
 * a manejar estando de descanso, lo que importa es que está en la vía.
 */
export function estadoChofer(o: { activo: boolean; enRuta: boolean; deDescanso: boolean }): EstadoChofer {
  if (!o.activo) return 'inactivo';
  if (o.enRuta) return 'en_ruta';
  if (o.deDescanso) return 'descanso';
  return 'disponible';
}

/* ───────────── Viajes ───────────── */

export type EstadoViaje = 'programado' | 'en_ruta' | 'finalizado' | 'cancelado';

export const ESTADO_VIAJE: Record<EstadoViaje, { label: string; icon: string; clase: string }> = {
  programado: { label: 'Programado', icon: '📅', clase: 'primary' },
  en_ruta: { label: 'En ruta', icon: '🚛', clase: 'info' },
  finalizado: { label: 'Finalizado', icon: '🏁', clase: 'success' },
  cancelado: { label: 'Cancelado', icon: '✖', clase: 'danger' },
};

export interface Parada {
  lugar: string;
  nota?: string | null;
  /** Cuándo se marcó como cumplida (ISO) o null si falta. */
  hecha_at?: string | null;
}

/** «3 de 5 paradas»: cuántas se cumplieron. */
export function progresoParadas(paradas: Parada[] | null | undefined): { hechas: number; total: number } {
  const p = paradas ?? [];
  return { hechas: p.filter((x) => !!x.hecha_at).length, total: p.length };
}

/** Los tipos de vehículo son los del catálogo de Asignaciones (una sola lista). */
const ICONO_TIPO: Record<string, string> = {
  'CAMIONETA': '🛻', 'AUTOMÓVIL': '🚗', 'CAMIÓN': '🚚', 'MOTO': '🏍', 'AUTOBÚS': '🚐', 'VEHÍCULO': '🚙', 'OTRO': '🚘',
};
export const TIPOS_FLOTA: { key: string; label: string; icon: string }[] = TIPOS_VEHICULO.map((t) => ({
  key: t, label: t.charAt(0) + t.slice(1).toLowerCase(), icon: ICONO_TIPO[t] ?? '🚗',
}));

export function labelTipoFlota(tipo: string | null | undefined): string {
  return TIPOS_FLOTA.find((t) => t.key === tipo)?.label ?? 'Vehículo';
}
export function iconoFlota(tipo: string | null | undefined): string {
  return TIPOS_FLOTA.find((t) => t.key === tipo)?.icon ?? '🚗';
}

export type EstadoFlota = 'operativo' | 'taller' | 'inactivo';
export const ESTADO_FLOTA: Record<EstadoFlota, { label: string; icon: string; clase: string }> = {
  operativo: { label: 'Operativo', icon: '✅', clase: 'success' },
  taller: { label: 'En taller', icon: '🔧', clase: 'warning' },
  inactivo: { label: 'Inactivo', icon: '⛔', clase: 'danger' },
};

/** «Origen → Destino» para listas. */
export function textoRuta(v: { origen: string; destino: string }): string {
  return `${v.origen.trim()} → ${v.destino.trim()}`;
}

/**
 * Validación de un «viaje ya realizado» (12-10-2026): se carga un viaje pasado directo como
 * finalizado, así que necesita salida y llegada reales, la llegada no puede ser antes de la
 * salida ni en el futuro, y el kilometraje de llegada no baja del de salida.
 * Las fechas vienen como datetime-local (AAAA-MM-DDTHH:mm): comparan bien como texto.
 */
export function errorViajeRealizado(o: { salida: string; llegada: string; kmSalida: number | null; kmLlegada: number | null; ahora: string }): string | null {
  if (!o.salida) return 'Indica la fecha y hora de salida.';
  if (!o.llegada) return 'Indica la fecha y hora de llegada del viaje.';
  if (o.llegada < o.salida) return 'La llegada no puede ser antes de la salida.';
  if (o.llegada > o.ahora) return 'Un viaje ya realizado no puede terminar en el futuro. Si todavía no llegó, prográmalo y usa ▶ Iniciar.';
  if (o.kmSalida != null && o.kmLlegada != null && o.kmLlegada < o.kmSalida) return 'El kilometraje de llegada no puede ser menor que el de salida.';
  return null;
}

/** Fecha AAAA-MM-DD de hoy en Venezuela. */
export function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
