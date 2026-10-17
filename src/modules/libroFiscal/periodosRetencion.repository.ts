/* ============================================================
   Golden Touch · Libro fiscal · Períodos: generar, declarar y reabrir (v8 · V3)

   Las funciones de la base devuelven cuántas retenciones tocaron. Sin permiso,
   con un período que no existe o en un estado que no corresponde, la base da
   error (RET_*) y aquí se traduce. Un 0 sin error no es un fallo: el período
   sí quedó declarado o reabierto, pero no movió ninguna retención (declaración
   en cero). No se informa como un «hecho» sin más: se devuelve el aviso para
   que la pantalla lo muestre.
   Depende del paquete V3; no se monta en pantalla hasta que BD lo confirme.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { errorRetencion } from './erroresRetencion';

export interface ResultadoPeriodo {
  /** Retenciones que cambiaron de estado. */
  filas: number;
  /** Texto para la pantalla. */
  mensaje: string;
  /** true cuando no se movió ninguna retención: la pantalla lo muestra como aviso, no como éxito. */
  enCero: boolean;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const plural = (k: number) => (k === 1 ? '1 retención' : `${k} retenciones`);

/** Crea los períodos del año que falten. Devuelve cuántos creó (0 = ya estaban todos). */
export async function generarPeriodos(anio: number): Promise<number> {
  const { data, error } = await supabase.rpc('retencion_periodos_generar', { p_anio: anio });
  if (error) throw errorRetencion(error, 'No se pudieron generar los períodos.');
  return n(data);
}

/** Declara un período: sus retenciones practicadas registradas pasan a «declarada». */
export async function declararPeriodo(id: string): Promise<ResultadoPeriodo> {
  const { data, error } = await supabase.rpc('retencion_periodo_declarar', { p_id: id });
  if (error) throw errorRetencion(error, 'No se pudo declarar el período.');
  const filas = n(data);
  return filas === 0
    ? { filas, enCero: true, mensaje: 'El período quedó declarado sin retenciones (declaración en cero). Si esperabas retenciones en él, revisa sus fechas y su período.' }
    : { filas, enCero: false, mensaje: `Período declarado: ${plural(filas)} pasaron a «declarada».` };
}

/** Reabre un período declarado, con su motivo: sus retenciones declaradas vuelven a «registrada». */
export async function reabrirPeriodo(id: string, motivo: string): Promise<ResultadoPeriodo> {
  const m = motivo.trim();
  if (!m) throw new Error('Indica el motivo para reabrir el período: queda en el historial.');
  const { data, error } = await supabase.rpc('retencion_periodo_reabrir', { p_id: id, p_motivo: m });
  if (error) throw errorRetencion(error, 'No se pudo reabrir el período.');
  const filas = n(data);
  return filas === 0
    ? { filas, enCero: true, mensaje: 'El período quedó reabierto, pero no tenía retenciones declaradas.' }
    : { filas, enCero: false, mensaje: `Período reabierto: ${plural(filas)} volvieron a «registrada».` };
}
