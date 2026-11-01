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

/* ------------------------------------------------------------
   31/10/2026 · Desde cuándo está encendido. El flujo nuevo aplica
   solo a las órdenes creadas EN o DESPUÉS de encender el interruptor
   (`sistema_interruptores.activado_en`, lo fija la base al encender);
   las pendientes de antes se siguen manejando como siempre.
   ------------------------------------------------------------ */

/** `activado_en` del interruptor si está encendido; `null` si está apagado o si algo falla. */
export async function interruptorDesde(clave: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('sistema_interruptores')
      .select('activo, activado_en')
      .eq('clave', clave)
      .maybeSingle();
    if (error || !data) return null;
    const fila = data as { activo?: unknown; activado_en?: unknown };
    if (fila.activo !== true) return null;
    return typeof fila.activado_en === 'string' && fila.activado_en ? fila.activado_en : null;
  } catch {
    return null;
  }
}

/** `activado_en` en vivo; `null` mientras carga o si está apagado. */
export function useInterruptorDesde(clave: string): string | null {
  const [desde, setDesde] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    void interruptorDesde(clave).then((v) => { if (vivo) setDesde(v); });
    return () => { vivo = false; };
  }, [clave, n]);
  useRealtime(['sistema_interruptores'], () => setN((x) => x + 1));
  return desde;
}

/**
 * ¿El flujo nuevo aplica a esta orden? Solo si el interruptor está encendido (`desde`)
 * y la orden se creó en o después de ese momento. Sin fecha de la orden (o fechas
 * ilegibles) → no aplica: ante la duda, la orden sigue como siempre.
 */
export function aplicaAOrden(desde: string | null, ordenCreatedAt: string | null | undefined): boolean {
  if (!desde || !ordenCreatedAt) return false;
  const tDesde = Date.parse(desde);
  const tOrden = Date.parse(ordenCreatedAt);
  if (Number.isNaN(tDesde) || Number.isNaN(tOrden)) return false;
  return tOrden >= tDesde;
}
