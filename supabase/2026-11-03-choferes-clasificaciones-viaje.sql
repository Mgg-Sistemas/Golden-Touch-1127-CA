-- ============================================================
-- Golden Touch · Choferes · Clasificaciones de viaje con su tarifa (03/11/2026)
-- Aplicado en GT (rroohciwhpfonklxuoev) como migración `choferes_clasificaciones_viaje`.
--
-- Antes: «Viaje corto / largo / interno» eran fijos en el código (CATEGORIAS_VIAJE).
-- Ahora: catálogo editable desde Rutas y viajes → «⚙ Clasificaciones».
--
--   clave       lo que se guarda en choferes_viajes.categoria_viaje (MAYÚSCULAS).
--               NO cambia nunca (trigger): renombrar solo cambia `nombre`, así los
--               viajes ya cargados, la nómina y los recibos no se rompen.
--   nombre      lo que se ve («Viaje corto»); en reportes sale en mayúsculas.
--   icono       emoji del botón rápido.
--   tarifa_usd  tarifa por viaje. En corto/largo/interno manda la tasa propia del
--               chofer (expediente) si la tiene; esta es la tarifa por defecto.
--   activo      desactivar = no sale en los botones ni en la detección automática;
--               los viajes viejos siguen mostrando su clasificación.
--   orden       orden de los botones y desempate en la detección.
--
-- Semilla: las 3 de siempre con sus claves y valores (VIAJE CORTO $25, VIAJE LARGO $50,
-- VIAJE INTERNO $1), que son exactamente las que ya tienen los viajes guardados.
-- choferes_viajes.categoria_viaje es text sin check: no hay enum que ampliar.
-- No borra nada. RLS: lee quien ve Choferes; escribe is_admin() or puede('choferes').
-- Auditoría (fn_auditar), updated_at y Realtime como el resto del módulo.
-- ============================================================

create table if not exists public.choferes_clasificaciones_viaje (
  id          uuid primary key default gen_random_uuid(),
  clave       text not null unique,
  nombre      text not null,
  icono       text not null default '🚛',
  tarifa_usd  numeric(12,2) not null default 0,
  activo      boolean not null default true,
  orden       integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  updated_by  text,
  constraint choferes_clasif_clave_chk  check (length(btrim(clave)) > 0 and clave = upper(btrim(clave))),
  constraint choferes_clasif_nombre_chk check (length(btrim(nombre)) > 0),
  constraint choferes_clasif_tarifa_chk check (tarifa_usd >= 0)
);

comment on table public.choferes_clasificaciones_viaje is
  'Clasificaciones de viaje (corto, largo, interno y las que agregue el usuario) con su tarifa por defecto. clave = choferes_viajes.categoria_viaje.';

-- Nombre único sin importar mayúsculas (dos «Viaje mina» confundirían los botones).
create unique index if not exists choferes_clasif_nombre_uq
  on public.choferes_clasificaciones_viaje (lower(btrim(nombre)));

insert into public.choferes_clasificaciones_viaje (clave, nombre, icono, tarifa_usd, orden, created_by)
values
  ('VIAJE CORTO',   'Viaje corto',   '🚗', 25, 1, 'sistema'),
  ('VIAJE LARGO',   'Viaje largo',   '🚚', 50, 2, 'sistema'),
  ('VIAJE INTERNO', 'Viaje interno', '🔄',  1, 3, 'sistema')
on conflict (clave) do nothing;

-- La clave no se cambia: es la que quedó escrita en los viajes.
create or replace function public.choferes_clasif_clave_fija()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.clave is distinct from old.clave then
    raise exception 'La clave de una clasificación de viaje no se cambia (está guardada en los viajes). Cambia el nombre.'
      using errcode = '22023';
  end if;
  return new;
end $$;

create or replace trigger trg_choferes_clasif_clave_fija
  before update on public.choferes_clasificaciones_viaje
  for each row execute function public.choferes_clasif_clave_fija();

create or replace trigger trg_set_updated_at
  before update on public.choferes_clasificaciones_viaje
  for each row execute function public.set_updated_at();

create or replace trigger trg_aud_choferes_clasificaciones_viaje
  after insert or update or delete on public.choferes_clasificaciones_viaje
  for each row execute function public.fn_auditar();

-- RLS (mismo patrón que choferes_viajes / choferes_descansos_config)
alter table public.choferes_clasificaciones_viaje enable row level security;

create policy "choferes_clasificaciones_viaje read" on public.choferes_clasificaciones_viaje
  for select to authenticated
  using ((select public.puede_leer('choferes')) or (select public.is_admin()));

create policy "choferes_clasificaciones_viaje write" on public.choferes_clasificaciones_viaje
  for all to authenticated
  using ((select public.is_admin()) or (select public.puede('choferes')))
  with check ((select public.is_admin()) or (select public.puede('choferes')));

grant select, insert, update, delete on public.choferes_clasificaciones_viaje to authenticated;

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'choferes_clasificaciones_viaje'
  ) then
    alter publication supabase_realtime add table public.choferes_clasificaciones_viaje;
  end if;
end $$;
