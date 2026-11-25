-- 25/11/2026 · Realtime de Combustible: faltaba publicar el contador del surtidor.
-- Las pantallas de combustible escuchan `combustible_contador_cambios` (TanquesView,
-- SurtidorMovilView), pero la tabla no estaba en `supabase_realtime`: esos cambios
-- nunca llegaban por Realtime. El resto de las tablas de combustible sí está publicada.
do $r$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'combustible_contador_cambios'
  ) then
    alter publication supabase_realtime add table public.combustible_contador_cambios;
  end if;
end $r$;
