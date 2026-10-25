-- 25/10/2026 · Choferes / Conductores · esquema alineado con MGG.
--
-- GT traía el módulo de MGG "sin pagos ni viáticos" y, por su cuenta, nombró distinto
-- algunas columnas (cantidad_viajes, empresa). Para traer TODO el módulo de MGG (cierre de
-- viajes por corte, pagos, viáticos, choferes y vehículos externos) sin traducir nombres en
-- cada archivo —y para que las próximas actualizaciones de MGG entren directas— se dejan
-- las columnas con los mismos nombres que MGG:
--
--   choferes_viajes      cantidad_viajes (int)  →  viajes (numeric > 0)
--                        + categoria_viaje (VIAJE CORTO / LARGO / INTERNO) y pagado_at
--   choferes_conductores empresa            →  empresa_externa
--                        + externo (boolean) y apellido
--
-- Las tablas de Choferes estaban VACÍAS al aplicar esto (0 conductores, 0 viajes, 0 pagos),
-- así que no se reescribe ningún dato. Las políticas RLS, Realtime, auditoría y las funciones
-- choferes_pago_crear / choferes_pago_anular ya existían y no se tocan.
-- La columna choferes_viajes.empresa (propia de GT) se deja: MGG no la usa y no estorba.
-- Idempotente.

-- ── choferes_viajes ──
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'choferes_viajes' and column_name = 'cantidad_viajes')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'choferes_viajes' and column_name = 'viajes') then
    alter table public.choferes_viajes drop constraint if exists choferes_viajes_cantidad_chk;
    alter table public.choferes_viajes rename column cantidad_viajes to viajes;
  end if;
end $$;

alter table public.choferes_viajes
  add column if not exists viajes numeric not null default 1;

alter table public.choferes_viajes alter column viajes type numeric using viajes::numeric;
alter table public.choferes_viajes alter column viajes set default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'choferes_viajes_viajes_chk') then
    alter table public.choferes_viajes add constraint choferes_viajes_viajes_chk check (viajes > 0);
  end if;
end $$;

alter table public.choferes_viajes
  add column if not exists categoria_viaje text default 'VIAJE CORTO',
  add column if not exists pagado_at timestamptz;

comment on column public.choferes_viajes.viajes is 'Cuántos viajes trae la orden (la tarifa es por viaje: el recibo paga tarifa × viajes).';
comment on column public.choferes_viajes.categoria_viaje is 'Categoría del viaje: VIAJE CORTO, VIAJE LARGO o VIAJE INTERNO.';
comment on column public.choferes_viajes.pagado_at is 'Fecha en que se liquidó / pagó en el cierre de viajes.';

create index if not exists idx_choferes_viajes_pagado_at on public.choferes_viajes (pagado_at);
create index if not exists idx_choferes_viajes_categoria on public.choferes_viajes (categoria_viaje);

-- ── choferes_conductores ──
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'choferes_conductores' and column_name = 'empresa')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'choferes_conductores' and column_name = 'empresa_externa') then
    alter table public.choferes_conductores rename column empresa to empresa_externa;
  end if;
end $$;

alter table public.choferes_conductores
  alter column personal_id drop not null,
  add column if not exists externo boolean not null default false,
  add column if not exists apellido text,
  add column if not exists empresa_externa text,
  add column if not exists nombre text,
  add column if not exists cedula text,
  add column if not exists telefono text;

-- Los que ya tenían nombre propio (sin ficha de RRHH) eran externos.
update public.choferes_conductores set externo = true where personal_id is null and not externo;

alter table public.choferes_conductores drop constraint if exists choferes_conductores_ficha_o_nombre_chk;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'choferes_conductores_externo_chk') then
    alter table public.choferes_conductores add constraint choferes_conductores_externo_chk
      check (personal_id is not null or (externo and length(btrim(coalesce(nombre, ''))) > 0));
  end if;
end $$;

comment on column public.choferes_conductores.externo is 'Chofer externo (no está en nómina): se le paga por viaje fuera de RRHH; nombre, apellido, cédula y teléfono van aquí.';
comment on column public.choferes_conductores.empresa_externa is 'Empresa o contratista para la que trabaja el chofer externo.';
