/* ============================================================
   Golden Touch · RRHH · Minutas (Supabase)

   La minuta se guarda en UNA sola escritura: sus secciones repetitivas
   viven en columnas jsonb de la misma fila. No hay cadena de escrituras
   que pueda cortarse a la mitad y dejar la minuta incompleta.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Minuta } from '@/shared/lib/types';
import { componerBusq, numeroMinuta, type BorradorMinuta } from './minutaModelo';

const TABLE = 'minutas';

const textoONull = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/**
 * Convierte lo que hay en pantalla en la fila que va a la base. Las filas que
 * el usuario dejó en blanco se descartan: nadie quiere ver renglones vacíos
 * guardados. Exportada para poder probarla sin tocar la red.
 */
export function filasAGuardar(b: BorradorMinuta): Record<string, unknown> {
  return {
    estado: b.estado,
    fecha: b.fecha,
    lugar: textoONull(b.lugar),
    hora_inicio: textoONull(b.hora_inicio),
    objetivo: textoONull(b.objetivo),
    orden_dia: b.orden_dia.map((s) => s.trim()).filter(Boolean),
    participantes: b.participantes.filter((p) => p.nombre.trim()),
    acuerdos: b.acuerdos.filter((a) => a.actividad.trim() || a.responsable.trim()),
    otros_asuntos: textoONull(b.otros_asuntos),
    proxima_fecha: b.proxima_fecha || null,
    proximos_puntos: b.proximos_puntos.map((s) => s.trim()).filter(Boolean),
    avances: b.avances.filter((a) => a.actividad.trim() || a.responsable.trim()),
    observaciones: textoONull(b.observaciones),
    anexar_adjuntos_pdf: b.anexar_adjuntos_pdf,
    busq: componerBusq(b),
  };
}

export async function listMinutas(): Promise<Minuta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').order('fecha', { ascending: false }).order('numero', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Minuta[];
}

export async function getMinuta(id: string): Promise<Minuta | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Minuta | null;
}

/** Número correlativo atómico por año. Dos personas a la vez nunca reciben el mismo. */
async function proximoNumero(anio: number): Promise<string> {
  const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `minuta-${anio}` });
  if (error) throw error;
  return numeroMinuta(anio, Number(data) || 1);
}

export async function crearMinuta(b: BorradorMinuta, actor: string): Promise<Minuta> {
  const anio = Number((b.fecha || '').slice(0, 4)) || new Date().getFullYear();
  const numero = await proximoNumero(anio);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...filasAGuardar(b), numero, creada_por: actor })
    .select('*').single();
  if (error) throw error;
  return data as Minuta;
}

export async function actualizarMinuta(id: string, b: BorradorMinuta, actor: string): Promise<Minuta> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...filasAGuardar(b), modificada_por: actor, modificada_en: new Date().toISOString() })
    .eq('id', id)
    .select('*').single();
  if (error) throw error;
  return data as Minuta;
}

export async function borrarMinuta(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
