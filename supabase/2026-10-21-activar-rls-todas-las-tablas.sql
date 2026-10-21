-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Activación y aseguramiento de RLS
-- Fecha: 2026-10-21
--
-- 1) Asegura que todas las tablas del esquema public tengan
--    Row Level Security (RLS) habilitado.
-- 2) Instala un Event Trigger para que cualquier tabla creada
--    en el futuro en el esquema public tenga RLS habilitado
--    automáticamente.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Habilitar RLS en todas las tablas del esquema public
do $$
declare
  r record;
  cnt integer := 0;
begin
  for r in (
    select tablename
    from pg_tables
    where schemaname = 'public'
  ) loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    cnt := cnt + 1;
  end loop;
  raise notice 'RLS asegurada en % tablas del esquema public.', cnt;
end $$;

-- 2. Event Trigger para habilitar RLS automáticamente en cualquier tabla nueva
create or replace function public.pgrst_enable_rls_on_create()
returns event_trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands() where command_tag in ('CREATE TABLE', 'CREATE TABLE AS')
  loop
    if obj.schema_name = 'public' then
      execute format('alter table %s enable row level security', obj.object_identity);
    end if;
  end loop;
end;
$$;

drop event trigger if exists pgrst_enable_rls_on_create;
create event trigger pgrst_enable_rls_on_create on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS')
execute function public.pgrst_enable_rls_on_create();
