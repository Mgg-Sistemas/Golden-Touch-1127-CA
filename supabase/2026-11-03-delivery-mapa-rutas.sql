-- ============================================================
-- Golden Touch · Delivery · mapa, ubicaciones y rutas (03/11/2026)
--
-- Pedido de la usuaria (estilo Yummy / Ridery): marcar la ubicación de los
-- proveedores, que el motorizado vea en el teléfono el proveedor más cercano
-- y la ruta, y que la PC vea en vivo a cada motorizado con su ruta.
--
-- 1) proveedores.lat / lng (+ quién y cuándo la marcó). Se marca desde la
--    ficha del proveedor (RLS de escritura de Proveedores) o, si el proveedor
--    no tiene ubicación, desde el teléfono del motorizado que tiene un pedido
--    en curso de ese proveedor (RPC delivery_ubicar_proveedor).
-- 2) delivery_lugares: puntos fijos de la ruta. Por ahora «los_pinos» =
--    Almacén Los Pinos (se marca una vez en el mapa; mover un punto ya
--    marcado: administrador o Delivery con permiso completo).
-- 3) delivery_rastro: el recorrido de cada pedido en curso (un punto por cada
--    envío de ubicación del motorizado, el mismo límite de 30 s / 50 m).
--    delivery_ubicar se reemplaza (misma firma) para anotarlo.
--
-- RLS: lectura is_admin() o puede_leer('delivery'); escritura solo por las
-- funciones SECURITY DEFINER con gate de Delivery. Realtime en las tablas nuevas.
-- Sin DROP ni DELETE (el MCP los declina): todo es idempotente.
-- ============================================================

-- ── 1) Ubicación del proveedor ──
alter table public.proveedores
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists ubicacion_actualizada_en timestamptz,
  add column if not exists ubicacion_actualizada_por text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proveedores_ubicacion_valida' and conrelid = 'public.proveedores'::regclass) then
    alter table public.proveedores add constraint proveedores_ubicacion_valida check (
      (lat is null and lng is null)
      or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
    );
  end if;
end $$;

comment on column public.proveedores.lat is 'Latitud del local del proveedor (Delivery: ruta y proveedor más cercano).';
comment on column public.proveedores.lng is 'Longitud del local del proveedor.';

-- Quién y cuándo movió el punto (también cuando se edita desde la ficha).
create or replace function public.proveedores_sellar_ubicacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    if new.lat is null and new.lng is null and tg_op = 'INSERT' then
      return new;
    end if;
    new.ubicacion_actualizada_en := now();
    new.ubicacion_actualizada_por := coalesce(lower(nullif(btrim(auth.jwt() ->> 'email'), '')), new.ubicacion_actualizada_por);
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_proveedores_sellar_ubicacion' and tgrelid = 'public.proveedores'::regclass) then
    create trigger trg_proveedores_sellar_ubicacion
      before insert or update of lat, lng on public.proveedores
      for each row execute function public.proveedores_sellar_ubicacion();
  end if;
end $$;

/**
 * El motorizado marca «📍 la ubicación del proveedor aquí» al llegar. Solo si el
 * proveedor todavía no tiene ubicación y el motorizado tiene en curso un pedido de
 * ese proveedor (o si quien lo hace puede escribir en Proveedores / es admin).
 */
create or replace function public.delivery_ubicar_proveedor(p_proveedor_id uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_staff boolean := public.is_admin() or public.puede('proveedores');
begin
  if not (public.is_admin() or public.delivery_puede('escritura')) then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 or (p_lat = 0 and p_lng = 0) then
    raise exception 'Ubicación inválida.' using errcode = '23514';
  end if;
  select lat into v_lat from public.proveedores where id = p_proveedor_id for update;
  if not found then
    raise exception 'El proveedor no existe.' using errcode = 'P0002';
  end if;
  if v_lat is not null and not v_staff then
    raise exception 'Ese proveedor ya tiene ubicación. Para moverla, pídelo a Compras (ficha del proveedor).' using errcode = '42501';
  end if;
  if not v_staff and not exists (
    select 1 from public.delivery_pedidos dp
    join public.ordenes o on o.id = dp.orden_id
    where dp.repartidor_id = auth.uid()
      and dp.estado in ('aceptado', 'en_ruta')
      and coalesce(dp.origen, 'compra') = 'compra'
      and o.proveedor_id = p_proveedor_id
  ) then
    raise exception 'Solo puedes marcar la ubicación de un proveedor cuyo pedido tienes en curso.' using errcode = '42501';
  end if;
  update public.proveedores set lat = p_lat, lng = p_lng where id = p_proveedor_id;
end $$;

revoke all on function public.delivery_ubicar_proveedor(uuid, double precision, double precision) from public, anon;
grant execute on function public.delivery_ubicar_proveedor(uuid, double precision, double precision) to authenticated;

-- ── 2) Puntos fijos de la ruta ──
create table if not exists public.delivery_lugares (
  clave text primary key,
  nombre text not null,
  lat double precision,
  lng double precision,
  actualizado_en timestamptz,
  actualizado_por text,
  constraint delivery_lugares_ubicacion_valida check (
    (lat is null and lng is null)
    or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
  )
);
comment on table public.delivery_lugares is 'Delivery: puntos fijos de la ruta (los_pinos = Almacén Los Pinos).';

insert into public.delivery_lugares (clave, nombre) values ('los_pinos', 'Almacén Los Pinos')
on conflict (clave) do nothing;

alter table public.delivery_lugares enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_lugares' and policyname = 'delivery_lugares read') then
    create policy "delivery_lugares read" on public.delivery_lugares for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')));
  end if;
end $$;
revoke insert, update, delete on public.delivery_lugares from anon, authenticated;
grant select on public.delivery_lugares to authenticated;

/** Marca (o mueve) un punto fijo. Marcarlo la primera vez: Delivery con escritura. Moverlo: admin o Delivery completo. */
create or replace function public.delivery_fijar_lugar(p_clave text, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
begin
  if not (public.is_admin() or public.delivery_puede('escritura')) then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 or (p_lat = 0 and p_lng = 0) then
    raise exception 'Ubicación inválida.' using errcode = '23514';
  end if;
  select lat into v_lat from public.delivery_lugares where clave = p_clave for update;
  if not found then
    raise exception 'Ese lugar no existe.' using errcode = 'P0002';
  end if;
  if v_lat is not null and not (public.is_admin() or public.puede_full('delivery')) then
    raise exception 'Ese lugar ya está marcado. Solo un administrador (o Delivery con permiso completo) lo puede mover.' using errcode = '42501';
  end if;
  update public.delivery_lugares
     set lat = p_lat, lng = p_lng, actualizado_en = now(),
         actualizado_por = lower(nullif(btrim(auth.jwt() ->> 'email'), ''))
   where clave = p_clave;
end $$;

revoke all on function public.delivery_fijar_lugar(text, double precision, double precision) from public, anon;
grant execute on function public.delivery_fijar_lugar(text, double precision, double precision) to authenticated;

-- ── 3) Rastro del pedido ──
create table if not exists public.delivery_rastro (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.delivery_pedidos(id) on delete cascade,
  repartidor_id uuid not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precision_m double precision,
  en timestamptz not null default now()
);
comment on table public.delivery_rastro is 'Delivery: recorrido de cada pedido en curso (lo anota delivery_ubicar).';
create index if not exists delivery_rastro_pedido_en_idx on public.delivery_rastro (pedido_id, en);

alter table public.delivery_rastro enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_rastro' and policyname = 'delivery_rastro read') then
    create policy "delivery_rastro read" on public.delivery_rastro for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')));
  end if;
end $$;
revoke insert, update, delete on public.delivery_rastro from anon, authenticated;
grant select on public.delivery_rastro to authenticated;

-- Misma firma y comportamiento que antes; además anota el punto en el rastro del pedido
-- (solo si el pedido es de quien manda la ubicación y sigue en curso).
create or replace function public.delivery_ubicar(
  p_lat double precision, p_lng double precision, p_precision double precision default null,
  p_velocidad double precision default null, p_rumbo double precision default null, p_pedido_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'Ubicación inválida.' using errcode = '23514';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  insert into public.delivery_ubicaciones (repartidor_id, repartidor_email, repartidor_nombre, lat, lng, precision_m, velocidad, rumbo, pedido_id, actualizado_en)
  values (auth.uid(), v_email, public.delivery_nombre_usuario(v_email), p_lat, p_lng, p_precision, p_velocidad, p_rumbo, p_pedido_id, now())
  on conflict (repartidor_id) do update set
    lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m, velocidad = excluded.velocidad,
    rumbo = excluded.rumbo, pedido_id = excluded.pedido_id, repartidor_nombre = excluded.repartidor_nombre,
    repartidor_email = excluded.repartidor_email, actualizado_en = now();
  if p_pedido_id is not null and exists (
    select 1 from public.delivery_pedidos
    where id = p_pedido_id and repartidor_id = auth.uid() and estado in ('aceptado', 'en_ruta')
  ) then
    insert into public.delivery_rastro (pedido_id, repartidor_id, lat, lng, precision_m)
    values (p_pedido_id, auth.uid(), p_lat, p_lng, p_precision);
  end if;
end $$;

-- ── Realtime en las tablas nuevas ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_lugares') then
    alter publication supabase_realtime add table public.delivery_lugares;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_rastro') then
    alter publication supabase_realtime add table public.delivery_rastro;
  end if;
end $$;
