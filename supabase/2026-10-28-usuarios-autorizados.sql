-- ============================================================
-- Usuarios autorizados (28/10/2026)
-- Roles y Permisos › «Usuarios autorizados para:». Cada usuario de la lista puede:
--   · aprobar_oc       → aprobar Órdenes de Compra
--   · aprobar_salidas  → aprobar Órdenes de Salida / Traslados / Salidas temporales
--   · o ambas.
-- `firma` guarda su firma manuscrita (PNG con fondo transparente, data URL) que se
-- estampa en las órdenes que ese usuario aprueba. Las aprobaciones ya hechas NO se
-- tocan: el PDF de una orden vieja sigue mostrando la firma de quien la aprobó.
-- El admin siempre puede aprobar.
-- ============================================================
create table if not exists public.usuarios_autorizados (
  email           text primary key,
  aprobar_oc      boolean not null default false,
  aprobar_salidas boolean not null default false,
  firma           text,
  firma_w         integer,
  firma_h         integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
);

create or replace function public.usuarios_autorizados_email_lower()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists trg_usuarios_autorizados_email_lower on public.usuarios_autorizados;
create trigger trg_usuarios_autorizados_email_lower before insert or update on public.usuarios_autorizados
  for each row execute function public.usuarios_autorizados_email_lower();

alter table public.usuarios_autorizados enable row level security;
drop policy if exists "usuarios_autorizados read auth" on public.usuarios_autorizados;
create policy "usuarios_autorizados read auth" on public.usuarios_autorizados
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists "usuarios_autorizados write admin" on public.usuarios_autorizados;
create policy "usuarios_autorizados write admin" on public.usuarios_autorizados
  for all using ((select public.is_admin()) or (select public.puede_full('usuarios')))
  with check ((select public.is_admin()) or (select public.puede_full('usuarios')));

grant select, insert, update, delete on public.usuarios_autorizados to authenticated;

-- Se arranca con quien ya aprobaba (LEYDIS RENGEL): no se pierde nada al cambiar de esquema.
insert into public.usuarios_autorizados (email, aprobar_oc, aprobar_salidas, updated_by)
values ('jhzgcontabilidad@gmail.com', true, true, 'sistema')
on conflict (email) do nothing;

-- Quién aprueba OC (lo usa el trigger que impide cancelar una OC ya firmada):
-- admin, o un usuario autorizado con «Aprobar órdenes de compra».
create or replace function public.puede_aprobar_oc()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and (
        u.role = 'admin'
        or exists (
          select 1 from public.usuarios_autorizados a
          where a.email = lower(u.email) and a.aprobar_oc
        )
      )
  );
$$;
grant execute on function public.puede_aprobar_oc() to anon, authenticated, service_role, public;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='usuarios_autorizados') then
    execute 'alter publication supabase_realtime add table public.usuarios_autorizados';
  end if;
end $$;
