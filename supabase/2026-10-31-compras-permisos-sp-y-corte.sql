-- =====================================================================
-- 2026-10-31 · Flujo nuevo de Compras · Fase 0 (preparación)
-- ---------------------------------------------------------------------
-- Decisiones de la usuaria (31/10/2026):
--   · Permisos separados en Roles y Permisos:
--       «Solicitud de Pedido» (solicitud_pedido): POR DEFECTO en TODOS los roles.
--         Crea SP y ve SOLO las fases de sus propias SP.
--       «Compras» (compras): ve y trabaja todo lo demás (cotizar, OC, servicios,
--         compra directa, reportes). Por defecto: admin, analista_de_compras,
--         analista_de_sistemas. El resto lo asigna la usuaria desde el panel.
--   · El permiso viejo `pedidos` NO se toca: 33 políticas RLS (cajas, abonos,
--     facturas, recepción, ofertas…) cuelgan de él; quitarlo trabaría pagos y
--     recepciones. Queda como permiso de base («pagos, recepción y retenciones»).
--   · Lo pendiente NO entra al flujo nuevo: solo las órdenes CREADAS después de
--     encender cada interruptor. Para eso `sistema_interruptores.activado_en`
--     guarda la hora en que se encendió (no se mueve con otros cambios de la fila).
--   · Almacén ve «Solicitudes de Pedido» en el teléfono.
-- =====================================================================

-- 1) Hora de encendido de cada interruptor ----------------------------
alter table public.sistema_interruptores
  add column if not exists activado_en timestamptz;

create or replace function public.sistema_interruptores_sello()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', (select u.email from public.usuarios u where u.id = auth.uid()), 'sistema');
  -- Al ENCENDER (apagado → encendido) queda la hora de corte: solo lo creado
  -- desde ese momento entra al flujo nuevo. Apagar no la borra.
  if new.activo and (tg_op = 'INSERT' or coalesce(old.activo, false) = false) then
    new.activado_en := now();
  elsif tg_op = 'UPDATE' then
    new.activado_en := coalesce(new.activado_en, old.activado_en);
  end if;
  return new;
end $function$;

-- 2) Delivery: solo OC CREADAS después de encender --------------------
create or replace function public.ordenes_a_delivery()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_desde  timestamptz;
  v_activo boolean;
  v_id     uuid;
  v_codigo text;
  v_prov   text;
  v_dedup  text;
begin
  begin
    select si.activo, coalesce(si.activado_en, si.updated_at) into v_activo, v_desde
      from public.sistema_interruptores si where si.clave = 'compras_delivery';
    -- Interruptor APAGADO (o inexistente) → nada cambia.
    if not coalesce(v_activo, false) then
      return null;
    end if;
    if new.estado is distinct from 'pagada'::public.estado_orden
       or coalesce(new.tipo, 'producto') <> 'producto'
       or new.pagada_en is null
       -- 31/10/2026: lo pendiente sigue como estaba; solo las órdenes NUEVAS.
       or (v_desde is not null and new.created_at < v_desde)
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
end $function$;

-- 3) Permisos nuevos en la matriz -------------------------------------
-- Solicitud de Pedido: todos los roles (lectura + escritura).
update public.roles_permisos
   set permisos = coalesce(permisos, '{}'::jsonb)
     || jsonb_build_object('solicitud_pedido', jsonb_build_object('lectura', true, 'escritura', true, 'full', false))
 where not (coalesce(permisos, '{}'::jsonb) ? 'solicitud_pedido');

-- Compras: admin, analista_de_compras y analista_de_sistemas; el resto sin acceso.
update public.roles_permisos
   set permisos = coalesce(permisos, '{}'::jsonb)
     || jsonb_build_object('compras',
          case when role in ('admin', 'analista_de_compras', 'analista_de_sistemas')
               then jsonb_build_object('lectura', true, 'escritura', true, 'full', true)
               else jsonb_build_object('lectura', false, 'escritura', false, 'full', false) end)
 where not (coalesce(permisos, '{}'::jsonb) ? 'compras');

-- 4) Almacén: pantalla «Solicitudes de Pedido» en el teléfono ----------
update public.roles_permisos
   set vistas_telefono = array_append(coalesce(vistas_telefono, '{}'::text[]), 'solicitudes')
 where role = 'almacenista'
   and not ('solicitudes' = any(coalesce(vistas_telefono, '{}'::text[])));

-- 5) RLS: quien solo tiene «Solicitud de Pedido» crea y sigue SUS SP ----
-- (los roles que conservan `pedidos` siguen cubiertos por «ordenes write pedidos»).
create policy "ordenes insert solicitud_pedido" on public.ordenes
  for insert to authenticated
  with check (
    (select public.puede('solicitud_pedido'))
    and lower(coalesce(solicitante_email, '')) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and estado in ('pendiente'::public.estado_orden, 'revision_almacen'::public.estado_orden)
  );

create policy "ordenes update propia solicitud_pedido" on public.ordenes
  for update to authenticated
  using (
    (select public.puede('solicitud_pedido'))
    and lower(coalesce(solicitante_email, '')) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and estado in ('pendiente'::public.estado_orden, 'revision_almacen'::public.estado_orden)
  )
  with check (
    (select public.puede('solicitud_pedido'))
    and lower(coalesce(solicitante_email, '')) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and estado in ('pendiente'::public.estado_orden, 'revision_almacen'::public.estado_orden, 'cancelada'::public.estado_orden)
  );

-- Chat de la orden: también quien solo tiene «Solicitud de Pedido».
alter policy "orden_mensajes write" on public.orden_mensajes
  with check ((select public.is_admin()) or (select public.puede('pedidos')) or (select public.puede('solicitud_pedido')));
