/* ============================================================
   Golden Touch · RRHH · Resumen de nómina · lectura (09/10/2026)
   Solo lectura: renglones con su período (sin los de la papelera), la
   cédula de cada trabajador y el nombre de la caja con que se pagó.
   El RLS de lectura de RRHH ya cubre estas tablas.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EmpresaRrhh } from '@/shared/lib/types';
import type { FilaResumen } from './resumenNomina';

const SELECT = '*, periodo:nomina_periodos!nomina_renglones_periodo_id_fkey!inner(id, codigo, nombre, empresa, tipo, periodo_desde, periodo_hasta, tasa_bcv, created_at, eliminado_en)';
const PAGINA = 1000;

/**
 * Renglones de UN período (`periodoId`) o de todas las nóminas (de una
 * empresa o de las dos). Se trae por páginas: Supabase corta en 1000 filas.
 */
export async function listFilasResumen(f: { periodoId?: string | null; empresa?: EmpresaRrhh | null }): Promise<FilaResumen[]> {
  const filas: FilaResumen[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.from('nomina_renglones').select(SELECT).is('periodo.eliminado_en', null);
    if (f.periodoId) q = q.eq('periodo_id', f.periodoId);
    if (f.empresa) q = q.eq('periodo.empresa', f.empresa);
    const { data, error } = await q.order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as FilaResumen[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  if (!filas.length) return filas;

  // Cédula (de la ficha) y caja (de Tesorería): dos consultas chicas, no una por renglón.
  const idsPersonal = [...new Set(filas.map((x) => x.personal_id).filter((x): x is string => !!x))];
  const idsCaja = [...new Set(filas.map((x) => x.caja_id).filter((x): x is string => !!x))];
  const [ced, cajas] = await Promise.all([
    traerPorIds<{ id: string; cedula: string | null }>('personal', 'id, cedula', idsPersonal),
    traerPorIds<{ id: string; nombre: string }>('cajas', 'id, nombre', idsCaja),
  ]);
  const cedulaDe = new Map(ced.map((p) => [p.id, p.cedula]));
  const cajaDe = new Map(cajas.map((c) => [c.id, c.nombre]));
  return filas.map((x) => ({
    ...x,
    cedula: x.personal_id ? cedulaDe.get(x.personal_id) ?? null : null,
    caja_nombre: x.caja_id ? cajaDe.get(x.caja_id) ?? null : null,
  }));
}

/** `in(...)` por tandas para no armar URLs enormes. */
async function traerPorIds<T>(tabla: string, columnas: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(tabla).select(columnas).in('id', ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}
