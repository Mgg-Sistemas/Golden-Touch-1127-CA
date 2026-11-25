-- 25/11/2026 · Auditoría de Realtime en todo el sistema.
-- La app escucha 173 tablas con useRealtime. De esas, 170 ya estaban en
-- `supabase_realtime`; faltaban estas tres, que existen, tienen PK, replica
-- identity por defecto y política SELECT para `authenticated`, pero nunca
-- emitían eventos: Minutas/RRHH las veía solo quien refrescaba.
--   · minutas              (MinutasTab)
--   · minuta_adjuntos      (MinutasTab)
--   · retencion_historial  (AuditoriaRetenciones)
-- Idempotente: se puede volver a aplicar sin duplicar publicaciones.
do $r$
declare t text;
begin
  foreach t in array array['minutas', 'minuta_adjuntos', 'retencion_historial']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $r$;
