import { supabase } from '@/shared/lib/supabase';
import type { EvaluacionRecepcion } from '@/shared/lib/types';

const TABLE = 'evaluaciones_recepcion';

export interface CrearEvaluacionInput {
  orden_id: string;
  proveedor_id: string;
  calidad: number;                 // 1-5
  puntualidad_dias: number;        // signed
  comentario?: string | null;
  evaluado_por_email: string;
  evaluado_por_rol: 'almacenista' | 'jefe';
}

export async function listByProveedor(proveedor_id: string): Promise<EvaluacionRecepcion[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('proveedor_id', proveedor_id)
    .order('evaluado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EvaluacionRecepcion[];
}

export async function getByOrden(orden_id: string): Promise<EvaluacionRecepcion | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('orden_id', orden_id)
    .maybeSingle();
  if (error) throw error;
  return (data as EvaluacionRecepcion) ?? null;
}

export async function crearEvaluacion(input: CrearEvaluacionInput): Promise<EvaluacionRecepcion> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      orden_id: input.orden_id,
      proveedor_id: input.proveedor_id,
      calidad: input.calidad,
      puntualidad_dias: input.puntualidad_dias,
      comentario: input.comentario ?? null,
      evaluado_por_email: input.evaluado_por_email,
      evaluado_por_rol: input.evaluado_por_rol,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as EvaluacionRecepcion;
}

/** El jefe ajusta una evaluación previa. Preserva el rating original. */
export async function ajustarEvaluacion(
  evaluacionId: string,
  ratingNuevo: number,
  jefeEmail: string,
  comentario?: string | null
): Promise<EvaluacionRecepcion> {
  // Lee el rating actual para snapshot en rating_original (solo si aún no se ajustó).
  const { data: prev, error: prevErr } = await supabase
    .from(TABLE)
    .select('calidad, ajustado_por_jefe, rating_original')
    .eq('id', evaluacionId)
    .single();
  if (prevErr || !prev) throw prevErr ?? new Error('Evaluación no encontrada');

  const ratingOriginal = prev.ajustado_por_jefe ? prev.rating_original : prev.calidad;

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      calidad: ratingNuevo,
      comentario: comentario ?? null,
      ajustado_por_jefe: true,
      rating_original: ratingOriginal,
      ajustado_en: new Date().toISOString(),
      evaluado_por_email: jefeEmail,
      evaluado_por_rol: 'jefe',
    })
    .eq('id', evaluacionId)
    .select('*')
    .single();
  if (error) throw error;
  return data as EvaluacionRecepcion;
}

/* ============================================================
   Stats agregados por proveedor (para el score)
   ============================================================ */

export interface ProveedorStats {
  puntualidad_pct: number;        // 0..1
  calidad_avg: number;            // 1..5 (3 si no hay datos)
  cumplimiento_pct: number;       // 0..1
  total_evaluaciones: number;
  total_ordenes: number;
}

/**
 * Calcula stats históricos para un conjunto de proveedores en 2 queries.
 * Sin historial → defaults neutros (50/3/100) para no penalizar a nuevos.
 */
export async function getStatsForProveedores(
  proveedorIds: string[]
): Promise<Map<string, ProveedorStats>> {
  const map = new Map<string, ProveedorStats>();
  if (!proveedorIds.length) return map;

  // Defaults para todos los pedidos.
  for (const id of proveedorIds) {
    map.set(id, {
      puntualidad_pct: 0.5,
      calidad_avg: 3,
      cumplimiento_pct: 1,
      total_evaluaciones: 0,
      total_ordenes: 0,
    });
  }

  const [evalsRes, ordenesRes] = await Promise.all([
    supabase
      .from(TABLE)
      .select('proveedor_id, calidad, puntualidad_dias')
      .in('proveedor_id', proveedorIds),
    supabase
      .from('ordenes')
      .select('proveedor_id, estado')
      .in('proveedor_id', proveedorIds),
  ]);

  if (evalsRes.data) {
    const grouped = new Map<string, { calidades: number[]; puntualidades: number[] }>();
    for (const e of evalsRes.data) {
      const pid = e.proveedor_id as string;
      const g = grouped.get(pid) ?? { calidades: [], puntualidades: [] };
      g.calidades.push(Number(e.calidad));
      g.puntualidades.push(Number(e.puntualidad_dias));
      grouped.set(pid, g);
    }
    for (const [pid, g] of grouped) {
      const calidad_avg = g.calidades.reduce((a, b) => a + b, 0) / g.calidades.length;
      const puntuales = g.puntualidades.filter((d) => d >= 0).length;
      const puntualidad_pct = puntuales / g.puntualidades.length;
      const existing = map.get(pid)!;
      map.set(pid, {
        ...existing,
        calidad_avg,
        puntualidad_pct,
        total_evaluaciones: g.calidades.length,
      });
    }
  }

  if (ordenesRes.data) {
    const grouped = new Map<string, { total: number; desistidas: number }>();
    for (const o of ordenesRes.data) {
      const pid = o.proveedor_id as string;
      if (!pid) continue;
      const g = grouped.get(pid) ?? { total: 0, desistidas: 0 };
      g.total++;
      if (o.estado === 'desistida_proveedor') g.desistidas++;
      grouped.set(pid, g);
    }
    for (const [pid, g] of grouped) {
      const cumplimiento_pct = g.total > 0 ? 1 - g.desistidas / g.total : 1;
      const existing = map.get(pid)!;
      map.set(pid, {
        ...existing,
        cumplimiento_pct,
        total_ordenes: g.total,
      });
    }
  }

  return map;
}
