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
  // Editando un campo Y con tecleo reciente: posponer el refresh.
  //
  // Eran 1,2 s y quedaba corto: quien redacta una nota o una justificación se para a
  // pensar más que eso a mitad de la frase, y justo ahí entraba el refresh. 4 s cubre
  // esas pausas y no se nota, porque el refresh igual sale apenas se suelta el campo.
  return editable && Date.now() - ultimaEscrituraAt < 4000;
}

/** Espera tras el primer evento, para juntar la ráfaga de cambios de una misma operación. */
const DEBOUNCE_MS = 400;
/** Tiempo mínimo entre dos recargas de la misma suscripción.
 *
 *  Antes solo había debounce: con varios usuarios operando, los eventos llegaban
 *  espaciados más de 400 ms y CADA uno recargaba la pantalla entera (Tesorería
 *  son 12 consultas; Inventario y Salidas, 10). El sistema se ponía lento para
 *  todos justo cuando más se usaba. Ahora los cambios que llegan mientras hay una
 *  recarga programada se suman a esa misma, y entre recarga y recarga pasan al
 *  menos 2,5 s. Lo nuevo sigue apareciendo solo, a lo sumo 2,5 s después. */
const RECARGA_MIN_MS = 2500;

/**
 * Suscribe `onChange` a los cambios de `tables`. Agrupa ráfagas (400 ms) y no
 * recarga más de una vez cada 2,5 s. Se desuscribe al desmontar o cambiar tablas.
 */
export function useRealtime(tables: string[], onChange: () => void, opts?: { enabled?: boolean; pollMs?: number }): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  const enabled = opts?.enabled ?? true;
  /** Respaldo opcional: si el evento Realtime se pierde (canal caído, RLS, etc.),
   *  la vista igual se pone al día. 0 = solo Realtime. */
  const pollMs = opts?.pollMs ?? 0;
  const key = [...tables].sort().join(',');

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !tables.length) return;
    let sb;
    try { sb = getSupabase(); } catch { return; }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultimaRecarga = 0;
    let pendienteOculto = false;            // hubo cambios mientras la pestaña no estaba visible
    const ocultaApi = typeof document !== 'undefined';

    // Si el usuario está escribiendo en un campo, se pospone hasta que termine para
    // no pisar lo tecleado (el realtime no se apaga, solo se difiere el re-render).
    const ejecutar = () => {
      if (escribiendoAhora()) { timer = setTimeout(ejecutar, 500); return; }
      timer = null;
      ultimaRecarga = Date.now();
      cb.current();
    };
    // Con una recarga ya programada, el evento nuevo se suma a ella (no la corre).
    const programar = () => {
      if (timer) return;
      const espera = Math.max(DEBOUNCE_MS, RECARGA_MIN_MS - (Date.now() - ultimaRecarga));
      timer = setTimeout(ejecutar, espera);
    };
    const alEvento = () => {
      // En segundo plano no recargamos (ahorra red/CPU); marcamos para ponernos al día al volver.
      if (ocultaApi && document.hidden) { pendienteOculto = true; return; }
      programar();
    };
    const alVolver = () => {
      if (ocultaApi && !document.hidden && pendienteOculto) { pendienteOculto = false; programar(); }
    };
    if (ocultaApi) document.addEventListener('visibilitychange', alVolver);

    // Respaldo para pantallas críticas (Combustible): un evento perdido no debe
    // obligar a refrescar a mano. Se respetan el debounce y el mínimo entre recargas.
    let poll: ReturnType<typeof setInterval> | null = null;
    if (pollMs > 0) {
      poll = setInterval(() => {
        if (ocultaApi && document.hidden) return;
        programar();
      }, pollMs);
    }

    // Un canal que muere (red, servidor, `CHANNEL_ERROR`/`TIMED_OUT`) antes callaba
    // para siempre: la pantalla seguía "en vivo" pero ya no recibía nada y había
    // que refrescar. Ahora se vuelve a suscribir con backoff hasta 30 s.
    let canal: ReturnType<typeof sb.channel> | null = null;
    let vivo = true;
    let reintentos = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const conectar = () => {
      canal = sb.channel(`rt-${key}-${Math.floor(Math.random() * 1e9)}`);
      tables.forEach((t) => {
        canal!.on('postgres_changes', { event: '*', schema: 'public', table: t }, alEvento);
      });
      canal.subscribe((status: string) => {
        if (!vivo) return;
        if (status === 'SUBSCRIBED') { reintentos = 0; return; }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
        if (canal) sb.removeChannel(canal);
        const espera = Math.min(30000, 2000 * 2 ** reintentos++);
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (vivo) conectar(); }, espera);
      });
    };
    conectar();

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
      if (ocultaApi) document.removeEventListener('visibilitychange', alVolver);
      if (canal) sb.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, pollMs]);
}
