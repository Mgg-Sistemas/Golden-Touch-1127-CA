/* ============================================================
   Golden Touch · Realtime · Suscripción a cambios de Supabase
   El sistema es multiusuario: lo que registra un usuario se refleja
   en los demás sin recargar. Este hook se suscribe a los cambios
   (INSERT/UPDATE/DELETE) de una o varias tablas y llama a `onChange`
   (debounced) para que la vista vuelva a cargar sus datos.

   Requiere que las tablas estén en la publicación `supabase_realtime`
   (ver supabase/schema.sql, sección realtime).
   ============================================================ */
import { useEffect, useRef } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';

/* Marca el instante de la última pulsación en cualquier campo de texto. Sirve para
   NO recargar (re-render) mientras el usuario está escribiendo: un re-render con datos
   nuevos puede pisar lo tecleado en un input controlado y "cortar" el texto a medias.
   El realtime sigue activo; solo se pospone el refresh hasta que se deja de escribir. */
let ultimaEscrituraAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('input', () => { ultimaEscrituraAt = Date.now(); }, true);
}
function escribiendoAhora(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const editable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  // Editando un campo Y con tecleo reciente (< 1.2 s): posponer el refresh.
  return editable && Date.now() - ultimaEscrituraAt < 1200;
}

/**
 * Suscribe `onChange` a los cambios de `tables`. Recarga con debounce (300 ms)
 * para agrupar ráfagas de eventos. Se desuscribe al desmontar o cambiar tablas.
 */
export function useRealtime(tables: string[], onChange: () => void, opts?: { enabled?: boolean }): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  const enabled = opts?.enabled ?? true;
  const key = [...tables].sort().join(',');

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !tables.length) return;
    let sb;
    try { sb = getSupabase(); } catch { return; }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendienteOculto = false;            // hubo cambios mientras la pestaña no estaba visible
    const ocultaApi = typeof document !== 'undefined';

    // Recarga con debounce (400 ms) para agrupar ráfagas de eventos relacionados.
    // Si el usuario está escribiendo en un campo, se pospone hasta que termine para
    // no pisar lo tecleado (el realtime no se apaga, solo se difiere el re-render).
    const ejecutar = () => {
      if (escribiendoAhora()) { timer = setTimeout(ejecutar, 500); return; }
      cb.current();
    };
    const programar = () => { if (timer) clearTimeout(timer); timer = setTimeout(ejecutar, 400); };
    const alEvento = () => {
      // En segundo plano no recargamos (ahorra red/CPU); marcamos para ponernos al día al volver.
      if (ocultaApi && document.hidden) { pendienteOculto = true; return; }
      programar();
    };
    const alVolver = () => {
      if (ocultaApi && !document.hidden && pendienteOculto) { pendienteOculto = false; programar(); }
    };
    if (ocultaApi) document.addEventListener('visibilitychange', alVolver);

    const channel = sb.channel(`rt-${key}-${Math.floor(Math.random() * 1e9)}`);
    tables.forEach((t) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, alEvento);
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      if (ocultaApi) document.removeEventListener('visibilitychange', alVolver);
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
