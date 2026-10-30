/* ============================================================
   Golden Touch · Interruptores del sistema (30/10/2026)
   Lee `sistema_interruptores` (clave → activo). Cualquier falla (tabla que
   aún no existe, red) cuenta como APAGADO: lo nuevo nunca se prende solo.
   ============================================================ */
import { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useRealtime } from '@/shared/lib/useRealtime';

export async function interruptorActivo(clave: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('sistema_interruptores')
      .select('activo')
      .eq('clave', clave)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { activo?: unknown }).activo === true;
  } catch {
    return false;
  }
}

/** Estado del interruptor en vivo; `false` mientras carga. */
export function useInterruptor(clave: string): boolean {
  const [activo, setActivo] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    void interruptorActivo(clave).then((v) => { if (vivo) setActivo(v); });
    return () => { vivo = false; };
  }, [clave, n]);
  useRealtime(['sistema_interruptores'], () => setN((x) => x + 1));
  return activo;
}
