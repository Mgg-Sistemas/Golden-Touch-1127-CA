-- =====================================================================
-- 2026-10-30 · Módulo DELIVERY (base de datos)
-- ---------------------------------------------------------------------
-- Una OC de PRODUCTOS que Tesorería marca como PAGADA (estado 'pagada' +
-- pagada_en) pasa a Delivery como pedido 'por_tomar'. El motorizado la
-- ACEPTA, va al proveedor (fotos al recibir), sale EN RUTA y la ENTREGA en
-- el almacén (fotos al entregar). Cancelar = «no puedo ir a buscarlo» (con
-- motivo): el pedido VUELVE a 'por_tomar' para que otro lo tome. La PC ve
-- el mapa con la última ubicación de cada motorizado.
--
-- CAMBIO DE LA USUARIA (30/10/2026): la OC entra a Delivery EN CUANTO QUEDA
-- PAGADA, SIN esperar la retención (se quitó la condición
-- comprobante_tipo/retencion_finalizada que traía el primer diseño).
--
-- Contrato de tipos: src/modules/delivery/delivery.types.ts (las 3 tablas
-- coinciden columna por columna con PedidoDelivery, EventoDeliveryRow y
-- UbicacionDelivery).
--
-- Interruptor: public.sistema_interruptores, clave 'compras_delivery' (APAGADO).
--   Encender:  update public.sistema_interruptores set activo = true
--               where clave = 'compras_delivery';
--   Apagar:    ... set activo = false ...
--   Al encender, sistema_interruptores.updated_at queda con la hora: SOLO
--   entran las OC con pagada_en >= esa hora (no se inunda con OC viejas).
--   OJO: cualquier UPDATE posterior a esa fila (p. ej. cambiar la
--   descripción) mueve updated_at y corre el corte hacia adelante.
--
-- Aplicado en Supabase GT (rroohciwhpfonklxuoev) el 30/10/2026 en 5 migraciones:
--   1) delivery_1_tablas_permisos
--   2) delivery_2_bucket_fotos
--   3) delivery_3_trigger_ordenes
--   4) delivery_4_rpc
--   5) delivery_5_eventos_orden_reloj
-- Este archivo es idempotente (se puede volver a correr completo).
--
-- PRUEBAS (30/10/2026, dos bloques DO que terminaron en
-- raise exception 'ROLLBACK_OK' → todo revertido). Usuarios: A = analista de
-- compras (NAZARET SALAZAR), B = admin (ADMINISTRADOR SISTEMAS), L =
-- almacenista (solo lectura). OC reales usadas solo dentro de la transacción:
-- OC-2026-0175 (factura, SIN retención), OC-2026-0176, CS-2026-0025 (servicio).
--   T1  interruptor APAGADO: OC pasa a pagada → 0 pedidos.                        OK
--   T2  OC pagada ANTES de encender (pagada_en ayer) → no entra.                  OK
--   T3  OC de servicio pagada → no entra.                                         OK
--   T4  OC con factura SIN retención, pagada después de encender → DEL-0001
--       'por_tomar', evento 'creado', 1 aviso a 'delivery'; otro UPDATE no
--       duplica.                                                                  OK
--   U1  transición real oc_aprobada → pagada (como Tesorería) → entra al
--       instante; U2 luego pasa a 'recibida' → sigue 1 pedido.                    OK
--   T5  almacenista ve el pedido pero aceptar → «No tienes permiso para
--       trabajar en Delivery.»                                                    OK
--   T6  A acepta → 'aceptado', repartidor NAZARET SALAZAR.                        OK
--   T7  B (aunque sea admin) intenta aceptar → «Este pedido ya lo tomó
--       NAZARET SALAZAR.»; B en_ruta → «El pedido DEL-0001 lo tiene ..., no tú.»  OK
--   T8  A en_ruta con 5 fotos → «Máximo 4 fotos...»; foto de otro pedido →
--       error; con 2 fotos → 'en_ruta'; adjuntar 2 más = 4; la quinta → error.    OK
--   T9  A cancela con motivo 'x' → error; con motivo → 'por_tomar', repartidor
--       null, cancelaciones=1, ultima_cancelacion_*, fotos archivadas en un
--       evento 'fotos', avisos a 'analista_de_compras' y 'delivery'.              OK
--   T10 B acepta; entregar sin en_ruta → error; en_ruta + entregar con 1 foto y
--       nota → 'entregado', avisos a 'almacenista' y 'analista_de_compras'; la
--       ORDEN NO SE TOCA (sigue 'pagada').                                        OK
--   T11 ubicación: dos upserts de A → 1 fila (lat 8.30, precisión 9); lat 95 →
--       «Ubicación inválida».                                                     OK
--   T12 A reabrir → «Solo un administrador...»; UPDATE directo a la tabla → 0
--       filas (RLS); contacto de analistas → solo el analista de una OC en
--       Delivery; B reabre desde 'entregado' → 'por_tomar', fotos archivadas.     OK
--   Auditoría: 9 filas en auditoria_eventos para el pedido; realtime en las 3.    OK
-- Después (base real): interruptor en FALSE; 0 filas en delivery_pedidos,
-- delivery_eventos y delivery_ubicaciones; 0 avisos 'del-%'; correlativo
-- 'delivery' sin crear; las OC de prueba siguen en 'oc_aprobada'.
--
-- get_advisors (security): las únicas alertas nuevas son las esperadas
-- «authenticated_security_definer_function_executable» de los 8 RPC públicos
-- de Delivery (igual que el resto de RPC del sistema: validan permiso por
-- dentro). Los ayudantes internos no aparecen (execute revocado).
-- =====================================================================


-- =====================================================================
-- 1) Interruptor, tablas, RLS, auditoría, realtime y permiso de módulo
-- =====================================================================

insert into public.sistema_interruptores (clave, activo, descripcion)
values ('compras_delivery', false,
  'Delivery: cada OC de productos que Tesorería marca como PAGADA pasa a Delivery para que un motorizado la busque al proveedor y la entregue en el almacén')
on conflict (clave) do nothing;

-- Un pedido por OC.
create table if not exists public.delivery_pedidos (
  id                        uuid primary key default gen_random_uuid(),
  orden_id                  uuid not null unique references public.ordenes(id) on delete cascade,
  codigo                    text not null unique default ('DEL-' || lpad(public.next_correlativo('delivery')::text, 4, '0')),
  estado                    text not null default 'por_tomar' check (estado in ('por_tomar', 'aceptado', 'en_ruta', 'entregado')),
  repartidor_email          text,
  repartidor_nombre         text,
  aceptado_en               timestamptz,
  en_ruta_en                timestamptz,
  entregado_en              timestamptz,
  -- [{path, nombre}] en el bucket privado delivery-fotos (máx. 4 por momento).
  fotos_recibido            jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos_recibido) = 'array'),
  fotos_entrega             jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos_entrega) = 'array'),
  nota_entrega              text,
  cancelaciones             int not null default 0,
  ultima_cancelacion_motivo text,
  ultima_cancelacion_por    text,
  ultima_cancelacion_en     timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz default now()
);
create index if not exists delivery_pedidos_estado_idx on public.delivery_pedidos (estado, created_at);
create index if not exists delivery_pedidos_repartidor_idx on public.delivery_pedidos (repartidor_email);

-- Historial de cada pedido.
create table if not exists public.delivery_eventos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.delivery_pedidos(id) on delete cascade,
  evento       text not null check (evento in ('creado', 'aceptado', 'cancelado', 'en_ruta', 'entregado', 'fotos', 'reabierto')),
  actor_email  text,
  actor_nombre text,
  motivo       text,
  detalle      text,
  lat          double precision,
  lng          double precision,
  at           timestamptz not null default clock_timestamp()  -- (migración 5) orden real dentro de una misma transacción
);
create index if not exists delivery_eventos_pedido_idx on public.delivery_eventos (pedido_id, at);
create index if not exists delivery_eventos_actor_idx on public.delivery_eventos (actor_email, at);

-- Última posición de cada motorizado (una fila por correo).
create table if not exists public.delivery_ubicaciones (
  repartidor_email  text primary key,
  repartidor_nombre text,
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),
  precision_m       double precision,
  pedido_id         uuid references public.delivery_pedidos(id) on delete set null,
  updated_at        timestamptz not null default now()
);
create index if not exists delivery_ubicaciones_pedido_idx on public.delivery_ubicaciones (pedido_id);

-- updated_at por trigger (función genérica del sistema).
create or replace trigger trg_delivery_pedidos_updated_at
  before update on public.delivery_pedidos
  for each row execute function public.set_updated_at();

-- RLS: solo lectura; toda escritura va por los RPC security definer (no hay
-- políticas de insert/update/delete).
alter table public.delivery_pedidos enable row level security;
alter table public.delivery_eventos enable row level security;
alter table public.delivery_ubicaciones enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_pedidos' and policyname = 'delivery_pedidos read') then
    create policy "delivery_pedidos read" on public.delivery_pedidos for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')) or (select public.puede_leer('pedidos')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_eventos' and policyname = 'delivery_eventos read') then
    create policy "delivery_eventos read" on public.delivery_eventos for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')) or (select public.puede_leer('pedidos')));
  end if;
  -- La ubicación de una persona es dato sensible: solo quien tiene el módulo
  -- Delivery (no todo el que lee Pedidos, que incluye obreros y otros).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_ubicaciones' and policyname = 'delivery_ubicaciones read') then
    create policy "delivery_ubicaciones read" on public.delivery_ubicaciones for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')));
  end if;
end $$;

revoke all on public.delivery_pedidos, public.delivery_eventos, public.delivery_ubicaciones from anon;
grant select on public.delivery_pedidos, public.delivery_eventos, public.delivery_ubicaciones to authenticated;

-- Auditoría (delivery_eventos ya es el historial; ubicaciones cambia cada
-- pocos segundos: no se audita).
create or replace trigger trg_aud_delivery_pedidos
  after insert or update or delete on public.delivery_pedidos
  for each row execute function public.fn_auditar();

-- Realtime.
do $$
declare t text;
begin
  foreach t in array array['delivery_pedidos', 'delivery_eventos', 'delivery_ubicaciones'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Permiso de módulo 'delivery' en roles_permisos.permisos (solo a los roles
-- que todavía NO tienen la clave: no pisa lo que se configure después).
update public.roles_permisos
   set permisos = permisos || jsonb_build_object('delivery', jsonb_build_object('lectura', true, 'escritura', true, 'full', true))
 where role in ('admin', 'analista_de_compras') and not (permisos ? 'delivery');
update public.roles_permisos
   set permisos = permisos || jsonb_build_object('delivery', jsonb_build_object('lectura', true, 'escritura', true, 'full', false))
 where role = 'delivery' and not (permisos ? 'delivery');
update public.roles_permisos
   set permisos = permisos || jsonb_build_object('delivery', jsonb_build_object('lectura', true, 'escritura', false, 'full', false))
 where role in ('jefa_de_administracion', 'analista_de_tesoreria', 'almacenista') and not (permisos ? 'delivery');
update public.roles_permisos
   set permisos = permisos || jsonb_build_object('delivery', jsonb_build_object('lectura', false, 'escritura', false, 'full', false))
 where not (permisos ? 'delivery');
-- El motorizado trabaja solo desde el teléfono.
update public.roles_permisos
   set vistas_telefono = case when 'delivery' = any(coalesce(vistas_telefono, '{}')) then vistas_telefono
                              else array_append(coalesce(vistas_telefono, '{}'), 'delivery') end,
       solo_telefono = true
 where role = 'delivery';


-- =====================================================================
-- 2) Bucket privado de fotos
--    Ruta: <pedido_id>/<recibido|entrega>/<timestamp>-<nombre>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-fotos', 'delivery-fotos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'delivery-fotos insert') then
    create policy "delivery-fotos insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'delivery-fotos'
        and ((select public.is_admin()) or (select public.puede('delivery')))
        and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibido|entrega)/[^/]{1,200}$');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'delivery-fotos update') then
    create policy "delivery-fotos update" on storage.objects for update to authenticated
      using (bucket_id = 'delivery-fotos' and ((select public.is_admin()) or (select public.puede('delivery'))))
      with check (bucket_id = 'delivery-fotos' and ((select public.is_admin()) or (select public.puede('delivery'))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'delivery-fotos read') then
    create policy "delivery-fotos read" on storage.objects for select to authenticated
      using (bucket_id = 'delivery-fotos'
        and ((select public.is_admin()) or (select public.puede_leer('delivery')) or (select public.puede_leer('pedidos'))));
  end if;
end $$;
-- (Sin política de DELETE: las fotos son evidencia; si hiciera falta borrar,
--  lo hace un admin desde el panel.)


-- =====================================================================
-- 3) Trigger en ordenes: OC de productos PAGADA → pedido 'por_tomar'
--    Se dispara con el UPDATE que pone estado='pagada' (Tesorería) y con
--    cualquier UPDATE posterior mientras siga 'pagada' (no duplica).
--    NO mira la retención (cambio de la usuaria 30/10/2026).
--    Nunca hace fallar el guardado de la orden (bloque con exception).
-- =====================================================================
create or replace function public.ordenes_a_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde  timestamptz;
  v_activo boolean;
  v_id     uuid;
  v_codigo text;
  v_prov   text;
  v_dedup  text;
begin
  begin
    select si.activo, si.updated_at into v_activo, v_desde
      from public.sistema_interruptores si where si.clave = 'compras_delivery';
    -- Interruptor APAGADO (o inexistente) → nada cambia.
    if not coalesce(v_activo, false) then
      return null;
    end if;
    if new.estado is distinct from 'pagada'::public.estado_orden
       or coalesce(new.tipo, 'producto') <> 'producto'
       or new.pagada_en is null
       or (v_desde is not null and new.pagada_en < v_desde)   -- no inundar con OC pagadas antes de encender
       or exists (select 1 from public.delivery_pedidos d where d.orden_id = new.id)
    then
      return null;
    end if;

    insert into public.delivery_pedidos (orden_id)
    values (new.id)
    on conflict (orden_id) do nothing
    returning id, codigo into v_id, v_codigo;
    if v_id is null then
      return null;
    end if;

    insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, detalle)
    values (v_id, 'creado', coalesce(new.pagada_por, auth.jwt() ->> 'email', 'sistema'), null,
            'OC ' || coalesce(new.oc_codigo, new.codigo) || ' pagada: pasa a Delivery');

    select nullif(btrim(p.razon_social), '') into v_prov from public.proveedores p where p.id = new.proveedor_id;
    v_dedup := 'del-nuevo-' || v_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('delivery', 'info',
      '🛵 Pedido ' || v_codigo || ' por buscar',
      'Pedido ' || v_codigo || ' por buscar · OC ' || coalesce(new.oc_codigo, new.codigo)
        || coalesce(' · proveedor ' || v_prov, '') || case when coalesce(new.urgente, false) then ' · URGENTE' else '' end,
      '#/app/delivery/telefono', v_dedup);
  exception when others then
    -- Nunca debe fallar el guardado de la orden por Delivery.
    raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.ordenes_a_delivery() from public, anon, authenticated;

create or replace trigger trg_ordenes_a_delivery
  after insert or update on public.ordenes
  for each row
  when (new.estado = 'pagada'::public.estado_orden)
  execute function public.ordenes_a_delivery();


-- =====================================================================
-- 4) RPC (security definer, search_path=public). Todas exigen
--    is_admin() or puede('delivery'); el actor sale de auth.jwt()->>'email'
--    y su nombre de usuarios (nombre + apellido). Devuelven la fila de
--    delivery_pedidos (o de delivery_ubicaciones).
-- =====================================================================

-- ---------- Ayudantes internos (el cliente NO los puede llamar) ----------
create or replace function public.delivery_nombre_actor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), '') from public.usuarios u where u.id = auth.uid()),
    (select nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), '') from public.usuarios u
      where lower(u.email) = lower(auth.jwt() ->> 'email') limit 1),
    auth.jwt() ->> 'email');
$$;
revoke execute on function public.delivery_nombre_actor() from public, anon, authenticated;

create or replace function public.delivery_exigir_permiso()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
begin
  if v_email is null or not (public.is_admin() or public.puede('delivery')) then
    raise exception 'No tienes permiso para trabajar en Delivery.' using errcode = '42501';
  end if;
  return v_email;
end $$;
revoke execute on function public.delivery_exigir_permiso() from public, anon, authenticated;

-- Valida y normaliza fotos: [{path, nombre}], path = '<pedido_id>/<momento>/<archivo>'.
create or replace function public.delivery_normalizar_fotos(p_pedido_id uuid, p_momento text, p_fotos jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  f     jsonb;
  v_path text;
begin
  if p_fotos is null or p_fotos = 'null'::jsonb then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_fotos) <> 'array' then
    raise exception 'Las fotos deben venir como lista.' using errcode = '22023';
  end if;
  for f in select x from jsonb_array_elements(p_fotos) x loop
    v_path := btrim(coalesce(f ->> 'path', ''));
    if jsonb_typeof(f) <> 'object' or v_path = '' then
      raise exception 'Cada foto debe traer su ruta (path).' using errcode = '22023';
    end if;
    if v_path not like p_pedido_id::text || '/' || p_momento || '/%' or position('..' in v_path) > 0 then
      raise exception 'La foto % no corresponde a este pedido (%).', v_path, p_momento using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'nombre', coalesce(nullif(btrim(f ->> 'nombre'), ''), regexp_replace(v_path, '^.*/', ''))));
  end loop;
  return v_out;
end $$;
revoke execute on function public.delivery_normalizar_fotos(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.delivery_ubicar(p_email text, p_nombre text, p_lat double precision, p_lng double precision,
                                                  p_precision double precision, p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lat is null or p_lng is null then
    return;
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Ubicación inválida (lat %, lng %).', p_lat, p_lng using errcode = '22023';
  end if;
  insert into public.delivery_ubicaciones as du (repartidor_email, repartidor_nombre, lat, lng, precision_m, pedido_id, updated_at)
  values (p_email, p_nombre, p_lat, p_lng, case when p_precision >= 0 then p_precision end, p_pedido_id, now())
  on conflict (repartidor_email) do update
     set repartidor_nombre = excluded.repartidor_nombre,
         lat = excluded.lat, lng = excluded.lng,
         precision_m = excluded.precision_m,
         pedido_id = excluded.pedido_id,
         updated_at = now();
end $$;
revoke execute on function public.delivery_ubicar(text, text, double precision, double precision, double precision, uuid) from public, anon, authenticated;

-- Al volver a 'por_tomar' (cancelar / reabrir) las fotos del intento anterior
-- se archivan en el historial (evento 'fotos', detalle = JSON con
-- {archivadas, repartidor, recibido, entrega}) y el pedido queda con las
-- listas vacías para que el próximo motorizado tenga sus 4 por momento.
create or replace function public.delivery_archivar_fotos(p public.delivery_pedidos, p_email text, p_nombre text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_array_length(p.fotos_recibido) + jsonb_array_length(p.fotos_entrega) > 0 then
    insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, motivo, detalle)
    values (p.id, 'fotos', p_email, p_nombre, p_motivo,
            jsonb_build_object('archivadas', true, 'repartidor', p.repartidor_email,
                               'recibido', p.fotos_recibido, 'entrega', p.fotos_entrega)::text);
  end if;
end $$;
revoke execute on function public.delivery_archivar_fotos(public.delivery_pedidos, text, text, text) from public, anon, authenticated;


-- ---------- ACEPTAR · REGLA DE LA USUARIA: si un delivery ya tomó el pedido,
--            NINGÚN OTRO puede tomarlo (UPDATE atómico con estado='por_tomar').
create or replace function public.delivery_aceptar(p_pedido_id uuid, p_lat double precision default null, p_lng double precision default null)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_p      public.delivery_pedidos;
begin
  update public.delivery_pedidos
     set estado = 'aceptado', repartidor_email = v_email, repartidor_nombre = v_nombre,
         aceptado_en = now(), en_ruta_en = null, entregado_en = null
   where id = p_pedido_id and estado = 'por_tomar'
  returning * into v_p;

  if not found then
    select * into v_p from public.delivery_pedidos where id = p_pedido_id;
    if not found then
      raise exception 'El pedido no existe.' using errcode = 'P0002';
    end if;
    if v_p.repartidor_email is not null then
      if lower(v_p.repartidor_email) = v_email then
        raise exception 'Ya tomaste el pedido % (estado: %).', v_p.codigo, v_p.estado using errcode = '22023';
      end if;
      raise exception 'Este pedido ya lo tomó %.', coalesce(v_p.repartidor_nombre, v_p.repartidor_email) using errcode = '22023';
    end if;
    raise exception 'El pedido % ya no está por tomar (estado: %).', v_p.codigo, v_p.estado using errcode = '22023';
  end if;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, lat, lng)
  values (v_p.id, 'aceptado', v_email, v_nombre, p_lat, p_lng);
  perform public.delivery_ubicar(v_email, v_nombre, p_lat, p_lng, null, v_p.id);

  -- El aviso «por buscar» ya está atendido.
  update public.notificaciones set read = true
   where dedup_key like 'del-nuevo-' || v_p.id || '%' and read = false;
  return v_p;
end $$;

-- ---------- CANCELAR («no puedo ir a buscarlo»): vuelve a por_tomar ----------
create or replace function public.delivery_cancelar(p_pedido_id uuid, p_motivo text, p_detalle text default null)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_motivo text := nullif(btrim(p_motivo), '');
  v_det    text := nullif(btrim(p_detalle), '');
  v_p      public.delivery_pedidos;
  v_oc     text;
  v_rol    text;
begin
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Indica el motivo por el que no puedes buscar el pedido.' using errcode = '22023';
  end if;
  select * into v_p from public.delivery_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if v_p.estado not in ('aceptado', 'en_ruta') then
    raise exception 'El pedido % no se puede cancelar (estado: %).', v_p.codigo, v_p.estado using errcode = '22023';
  end if;
  if lower(coalesce(v_p.repartidor_email, '')) <> v_email and not public.is_admin() then
    raise exception 'Solo % puede cancelar el pedido %.', coalesce(v_p.repartidor_nombre, v_p.repartidor_email), v_p.codigo using errcode = '42501';
  end if;

  perform public.delivery_archivar_fotos(v_p, v_email, v_nombre, 'Fotos archivadas al cancelar');

  update public.delivery_pedidos
     set estado = 'por_tomar', repartidor_email = null, repartidor_nombre = null,
         aceptado_en = null, en_ruta_en = null, entregado_en = null,
         fotos_recibido = '[]'::jsonb, fotos_entrega = '[]'::jsonb,
         cancelaciones = cancelaciones + 1,
         ultima_cancelacion_motivo = v_motivo || coalesce(' · ' || v_det, ''),
         ultima_cancelacion_por = v_nombre,
         ultima_cancelacion_en = now()
   where id = v_p.id
  returning * into v_p;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, motivo, detalle)
  values (v_p.id, 'cancelado', v_email, v_nombre, v_motivo, v_det);

  update public.delivery_ubicaciones set pedido_id = null where pedido_id = v_p.id;

  select coalesce(o.oc_codigo, o.codigo) into v_oc from public.ordenes o where o.id = v_p.orden_id;
  foreach v_rol in array array['analista_de_compras', 'delivery'] loop
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values (v_rol, 'warning',
      '↩️ ' || v_p.codigo || ' de nuevo por tomar',
      v_nombre || ' no puede buscar el pedido ' || v_p.codigo || coalesce(' (OC ' || v_oc || ')', '')
        || ': ' || v_motivo || '. El pedido quedó otra vez por tomar.',
      case when v_rol = 'delivery' then '#/app/delivery/telefono' else '#/app/delivery' end,
      'del-nuevo-' || v_p.id || '-c' || v_p.cancelaciones || '-' || v_rol);
  end loop;
  return v_p;
end $$;

-- ---------- EN RUTA (ya lo recibió del proveedor) ----------
create or replace function public.delivery_en_ruta(p_pedido_id uuid, p_fotos jsonb default '[]'::jsonb,
                                                   p_lat double precision default null, p_lng double precision default null)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_p      public.delivery_pedidos;
  v_fotos  jsonb;
begin
  select * into v_p from public.delivery_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_p.repartidor_email, '')) <> v_email then
    raise exception 'El pedido % lo tiene %, no tú.', v_p.codigo, coalesce(v_p.repartidor_nombre, 'nadie') using errcode = '42501';
  end if;
  if v_p.estado <> 'aceptado' then
    raise exception 'El pedido % no está aceptado (estado: %).', v_p.codigo, v_p.estado using errcode = '22023';
  end if;
  v_fotos := public.delivery_normalizar_fotos(v_p.id, 'recibido', p_fotos);
  if jsonb_array_length(v_p.fotos_recibido) + jsonb_array_length(v_fotos) > 4 then
    raise exception 'Máximo 4 fotos al recibir el pedido.' using errcode = '22023';
  end if;

  update public.delivery_pedidos
     set estado = 'en_ruta', en_ruta_en = now(), fotos_recibido = fotos_recibido || v_fotos
   where id = v_p.id
  returning * into v_p;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, detalle, lat, lng)
  values (v_p.id, 'en_ruta', v_email, v_nombre,
          case when jsonb_array_length(v_fotos) > 0 then jsonb_array_length(v_fotos) || ' foto(s) al recibir' end, p_lat, p_lng);
  perform public.delivery_ubicar(v_email, v_nombre, p_lat, p_lng, null, v_p.id);
  return v_p;
end $$;

-- ---------- ENTREGAR en el almacén (NO toca la orden: la recepción sigue por Recepciones) ----------
create or replace function public.delivery_entregar(p_pedido_id uuid, p_fotos jsonb default '[]'::jsonb, p_nota text default null,
                                                    p_lat double precision default null, p_lng double precision default null)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_p      public.delivery_pedidos;
  v_fotos  jsonb;
  v_oc     text;
  v_rol    text;
begin
  select * into v_p from public.delivery_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_p.repartidor_email, '')) <> v_email then
    raise exception 'El pedido % lo tiene %, no tú.', v_p.codigo, coalesce(v_p.repartidor_nombre, 'nadie') using errcode = '42501';
  end if;
  if v_p.estado <> 'en_ruta' then
    raise exception 'El pedido % no está en ruta (estado: %).', v_p.codigo, v_p.estado using errcode = '22023';
  end if;
  v_fotos := public.delivery_normalizar_fotos(v_p.id, 'entrega', p_fotos);
  if jsonb_array_length(v_p.fotos_entrega) + jsonb_array_length(v_fotos) > 4 then
    raise exception 'Máximo 4 fotos al entregar el pedido.' using errcode = '22023';
  end if;

  update public.delivery_pedidos
     set estado = 'entregado', entregado_en = now(), fotos_entrega = fotos_entrega || v_fotos,
         nota_entrega = nullif(btrim(p_nota), '')
   where id = v_p.id
  returning * into v_p;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, detalle, lat, lng)
  values (v_p.id, 'entregado', v_email, v_nombre, nullif(btrim(p_nota), ''), p_lat, p_lng);
  perform public.delivery_ubicar(v_email, v_nombre, p_lat, p_lng, null, null);

  select coalesce(o.oc_codigo, o.codigo) into v_oc from public.ordenes o where o.id = v_p.orden_id;
  foreach v_rol in array array['almacenista', 'analista_de_compras'] loop
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values (v_rol, 'success',
      '✅ ' || v_p.codigo || ' entregado en almacén por ' || v_nombre,
      v_p.codigo || coalesce(' (OC ' || v_oc || ')', '') || ' entregado en almacén por ' || v_nombre
        || coalesce('. Nota: ' || nullif(btrim(p_nota), ''), '') || '. Falta la recepción en Recepciones.',
      '#/app/delivery', 'del-entregado-' || v_p.id || '-' || v_rol || '-' || extract(epoch from v_p.entregado_en)::bigint);
  end loop;
  return v_p;
end $$;

-- ---------- ADJUNTAR más fotos (el asignado o admin; tope 4 por momento) ----------
create or replace function public.delivery_adjuntar_fotos(p_pedido_id uuid, p_momento text, p_fotos jsonb)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_p      public.delivery_pedidos;
  v_fotos  jsonb;
begin
  if p_momento not in ('recibido', 'entrega') then
    raise exception 'Momento inválido: debe ser «recibido» o «entrega».' using errcode = '22023';
  end if;
  select * into v_p from public.delivery_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_p.repartidor_email, '')) <> v_email and not public.is_admin() then
    raise exception 'El pedido % lo tiene %, no tú.', v_p.codigo, coalesce(v_p.repartidor_nombre, 'nadie') using errcode = '42501';
  end if;
  if v_p.estado = 'por_tomar' then
    raise exception 'El pedido % todavía no lo ha tomado nadie.', v_p.codigo using errcode = '22023';
  end if;
  v_fotos := public.delivery_normalizar_fotos(v_p.id, p_momento, p_fotos);
  if jsonb_array_length(v_fotos) = 0 then
    raise exception 'No hay fotos para adjuntar.' using errcode = '22023';
  end if;
  if p_momento = 'recibido' then
    if jsonb_array_length(v_p.fotos_recibido) + jsonb_array_length(v_fotos) > 4 then
      raise exception 'Máximo 4 fotos al recibir el pedido.' using errcode = '22023';
    end if;
    update public.delivery_pedidos set fotos_recibido = fotos_recibido || v_fotos where id = v_p.id returning * into v_p;
  else
    if jsonb_array_length(v_p.fotos_entrega) + jsonb_array_length(v_fotos) > 4 then
      raise exception 'Máximo 4 fotos al entregar el pedido.' using errcode = '22023';
    end if;
    update public.delivery_pedidos set fotos_entrega = fotos_entrega || v_fotos where id = v_p.id returning * into v_p;
  end if;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, motivo, detalle)
  values (v_p.id, 'fotos', v_email, v_nombre, p_momento, jsonb_array_length(v_fotos) || ' foto(s)');
  return v_p;
end $$;

-- ---------- UBICACIÓN del motorizado (para el mapa de la PC) ----------
create or replace function public.delivery_actualizar_ubicacion(p_lat double precision, p_lng double precision,
                                                                p_precision double precision default null, p_pedido_id uuid default null)
returns public.delivery_ubicaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_u      public.delivery_ubicaciones;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Ubicación inválida (lat %, lng %).', p_lat, p_lng using errcode = '22023';
  end if;
  if p_pedido_id is not null and not exists (select 1 from public.delivery_pedidos where id = p_pedido_id) then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  perform public.delivery_ubicar(v_email, v_nombre, p_lat, p_lng, p_precision, p_pedido_id);
  select * into v_u from public.delivery_ubicaciones where repartidor_email = v_email;
  return v_u;
end $$;

-- ---------- REABRIR (solo admin): vuelve a por_tomar desde cualquier estado (incluso entregado) ----------
create or replace function public.delivery_reabrir(p_pedido_id uuid)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.delivery_exigir_permiso();
  v_nombre text := public.delivery_nombre_actor();
  v_p      public.delivery_pedidos;
  v_antes  text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede reabrir un pedido de Delivery.' using errcode = '42501';
  end if;
  select * into v_p from public.delivery_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if v_p.estado = 'por_tomar' then
    raise exception 'El pedido % ya está por tomar.', v_p.codigo using errcode = '22023';
  end if;
  v_antes := v_p.estado || coalesce(' · ' || coalesce(v_p.repartidor_nombre, v_p.repartidor_email), '');

  perform public.delivery_archivar_fotos(v_p, v_email, v_nombre, 'Fotos archivadas al reabrir');

  update public.delivery_pedidos
     set estado = 'por_tomar', repartidor_email = null, repartidor_nombre = null,
         aceptado_en = null, en_ruta_en = null, entregado_en = null,
         fotos_recibido = '[]'::jsonb, fotos_entrega = '[]'::jsonb, nota_entrega = null
   where id = v_p.id
  returning * into v_p;

  insert into public.delivery_eventos (pedido_id, evento, actor_email, actor_nombre, motivo, detalle)
  values (v_p.id, 'reabierto', v_email, v_nombre, 'Reabierto por administración', 'Antes: ' || v_antes);
  update public.delivery_ubicaciones set pedido_id = null where pedido_id = v_p.id;

  insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
  values ('delivery', 'info', '🛵 Pedido ' || v_p.codigo || ' por buscar',
          'El pedido ' || v_p.codigo || ' fue reabierto y está otra vez por tomar.',
          '#/app/delivery/telefono', 'del-nuevo-' || v_p.id || '-r' || extract(epoch from now())::bigint);
  return v_p;
end $$;

-- ---------- Contacto del analista que montó la OC ----------
-- usuarios solo se lee a sí mismo por RLS; el motorizado necesita nombre y
-- teléfono del analista (botón «📞 Llamar al analista»). Solo devuelve
-- analistas de OC que están en Delivery (no es un directorio general).
create or replace function public.delivery_contacto_analistas(p_emails text[])
returns table (email text, nombre text, telefono text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.puede_leer('delivery')) then
    raise exception 'No tienes permiso para ver Delivery.' using errcode = '42501';
  end if;
  return query
  select u.email, nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), u.telefono
    from public.usuarios u
   where lower(u.email) = any (select lower(x) from unnest(coalesce(p_emails, '{}')) x)
     and exists (select 1 from public.delivery_pedidos d join public.ordenes o on o.id = d.orden_id
                  where lower(u.email) in (lower(coalesce(o.oc_creada_por, '')), lower(coalesce(o.oc_emitida_por, ''))));
end $$;

revoke execute on function public.delivery_aceptar(uuid, double precision, double precision) from public, anon;
revoke execute on function public.delivery_cancelar(uuid, text, text) from public, anon;
revoke execute on function public.delivery_en_ruta(uuid, jsonb, double precision, double precision) from public, anon;
revoke execute on function public.delivery_entregar(uuid, jsonb, text, double precision, double precision) from public, anon;
revoke execute on function public.delivery_adjuntar_fotos(uuid, text, jsonb) from public, anon;
revoke execute on function public.delivery_actualizar_ubicacion(double precision, double precision, double precision, uuid) from public, anon;
revoke execute on function public.delivery_reabrir(uuid) from public, anon;
revoke execute on function public.delivery_contacto_analistas(text[]) from public, anon;
grant execute on function public.delivery_aceptar(uuid, double precision, double precision) to authenticated;
grant execute on function public.delivery_cancelar(uuid, text, text) to authenticated;
grant execute on function public.delivery_en_ruta(uuid, jsonb, double precision, double precision) to authenticated;
grant execute on function public.delivery_entregar(uuid, jsonb, text, double precision, double precision) to authenticated;
grant execute on function public.delivery_adjuntar_fotos(uuid, text, jsonb) to authenticated;
grant execute on function public.delivery_actualizar_ubicacion(double precision, double precision, double precision, uuid) to authenticated;
grant execute on function public.delivery_reabrir(uuid) to authenticated;
grant execute on function public.delivery_contacto_analistas(text[]) to authenticated;


-- =====================================================================
-- 5) (migración delivery_5_eventos_orden_reloj) — ya incluido arriba en el
--    create table; para bases donde la tabla ya existía:
-- =====================================================================
alter table public.delivery_eventos alter column at set default clock_timestamp();
