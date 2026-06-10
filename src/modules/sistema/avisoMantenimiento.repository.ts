/* ============================================================
   Golden Touch · Aviso de mantenimiento (banner global)
   Una sola fila (id=1). Cuando `activo` está en true, todas las
   sesiones muestran un banner avisando del despliegue/actualización
   para que la gente guarde su progreso. Se propaga por Realtime.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export interface AvisoMantenimiento {
  id: number;
  activo: boolean;
  mensaje: string | null;
  minutos: number | null;
  programado_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

const TABLE = 'aviso_mantenimiento';

export async function getAvisoMantenimiento(): Promise<AvisoMantenimiento | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data as AvisoMantenimiento | null) ?? null;
}

export async function setAvisoMantenimiento(
  patch: { activo: boolean; mensaje?: string | null; minutos?: number | null; programado_at?: string | null },
  actorEmail?: string | null,
): Promise<void> {
  const { error } = await supabase.from(TABLE).update({
    activo: patch.activo,
    mensaje: patch.mensaje ?? null,
    minutos: patch.minutos ?? null,
    programado_at: patch.programado_at ?? null,
    updated_at: new Date().toISOString(),
    updated_by: actorEmail ?? null,
  }).eq('id', 1);
  if (error) throw error;
}
