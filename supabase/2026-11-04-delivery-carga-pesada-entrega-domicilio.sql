-- ============================================================================
-- 04/11/2026 · Compras: ¿quién entrega la OC? (DELIVERY / CARGA PESADA / A DOMICILIO)
--
-- Al cargar el método de pago en Compras se marca cómo llega la orden:
--   · 'delivery'      → una vez pagada va a la vista Delivery (como siempre).
--   · 'carga_pesada'  → una vez pagada va a la vista CARGA PESADA (mismo flujo que
--                       Delivery, con su propio rol: el de Delivery no la ve y viceversa).
--   · 'proveedor'     → CON ENTREGA A DOMICILIO: la trae el proveedor; no entra ni a
--                       Delivery ni a Carga pesada.
-- Sin dato (OC viejas) = 'delivery'. Los retiros en Almacén Los Pinos siguen en Delivery.
-- ============================================================================

alter table public.ordenes add column if not exists modalidad_entrega text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_modalidad_entrega_chk') then
    alter table public.ordenes add constraint ordenes_modalidad_entrega_chk
      check (modalidad_entrega is null or modalidad_entrega in ('delivery', 'carga_pesada', 'proveedor'));
  end if;
end $$;
comment on column public.ordenes.modalidad_entrega is
  'Quién entrega la OC pagada: delivery | carga_pesada | proveedor (a domicilio). null = delivery.';

-- ── Rol CARGA PESADA (permiso de módulo carga_pesada, solo pantalla de teléfono) ──
insert into public.custom_roles (key, label, descripcion, color, sistema, created_by)
values ('carga_pesada', 'CARGA PESADA',
  'ROL PARA LOS DE CARGA PESADA: DESDE EL TLF SOLO VEN LOS PEDIDOS MARCADOS «CARGA PESADA». NO VEN LOS DE DELIVERY.',
  '#7c2d12', false, 'sistema')
on conflict (key) do nothing;

insert into public.roles_permisos (role, permisos, vistas_telefono, solo_telefono, almacenes, updated_by)
select 'carga_pesada',
  (rp.permisos - 'delivery')
    || jsonb_build_object('delivery', jsonb_build_object('lectura', false, 'escritura', false, 'full', false))
    || jsonb_build_object('carga_pesada', jsonb_build_object('lectura', true, 'escritura', true, 'full', false)),
  array['carga_pesada']::text[], true, rp.almacenes, 'sistema'
from public.roles_permisos rp where rp.role = 'delivery'
on conflict (role) do nothing;

-- ── Permisos: Delivery o Carga pesada abren las funciones del flujo ──
create or replace function public.delivery_puede(p_nivel text default 'lectura') returns boolean
language sql stable security definer set search_path = '' as $$
  select case coalesce(p_nivel, 'lectura')
    when 'full' then public.puede_full('delivery') or public.puede_full('carga_pesada')
    when 'escritura' then public.puede('delivery') or public.puede('carga_pesada')
    else public.puede_leer('delivery') or public.puede_leer('carga_pesada')
  end;
$$;

create or replace function public.delivery_exigir_permiso() returns text
language plpgsql stable security definer set search_path = 'public' as $$
declare v_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
begin
  if v_email is null or not (public.is_admin() or public.puede('delivery') or public.puede('carga_pesada')) then
    raise exception 'No tienes permiso para trabajar en Delivery / Carga pesada.' using errcode = '42501';
  end if;
  return v_email;
end $$;

/** El canal de una OC: 'carga_pesada', 'proveedor' o 'delivery' (sin dato). */
create or replace function public.delivery_canal_orden(p_modalidad text) returns text
language sql immutable set search_path = '' as $$
  select case when p_modalidad in ('carga_pesada', 'proveedor') then p_modalidad else 'delivery' end;
$$;

/** ¿Puede el usuario trabajar este canal? Delivery solo ve delivery; Carga pesada solo carga pesada. */
create or replace function public.delivery_puede_canal(p_canal text, p_nivel text default 'lectura') returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_canal = 'carga_pesada' then
      case coalesce(p_nivel, 'lectura') when 'escritura' then public.puede('carga_pesada') else public.puede_leer('carga_pesada') end
    else
      case coalesce(p_nivel, 'lectura') when 'escritura' then public.puede('delivery') else public.puede_leer('delivery') end
  end;
$$;

-- ── Listado por canal (el de siempre + el filtro de quién entrega) ──
create or replace function public.delivery_listado_canal(p_incluir_cerrados boolean default false, p_canal text default 'delivery')
 RETURNS TABLE(orden_id uuid, oc_codigo text, codigo text, total numeric, moneda text, urgente boolean, pagada_en timestamp with time zone, items jsonb, notas text, motivo text, finalidad text, almacen_destino text, proveedor_id uuid, proveedor_nombre text, proveedor_telefono text, proveedor_direccion text, proveedor_contacto text, analista_email text, analista_nombre text, analista_telefono text, pedido_id uuid, estado text, repartidor_id uuid, repartidor_nombre text, aceptado_en timestamp with time zone, en_ruta_en timestamp with time zone, entregado_en timestamp with time zone, cancelado_en timestamp with time zone, motivo_cancel text, detalle_cancel text, almacen_entrega text, nota_entrega text, fotos_recibo jsonb, fotos_entrega jsonb, historial jsonb, es_mio boolean, origen text, unidad_solicitante text, solicitante_nombre text, solicitante_telefono text, revisada_en timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_desde timestamptz; v_alm boolean;
        v_canal text := case when p_canal = 'carga_pesada' then 'carga_pesada' else 'delivery' end;
begin
  if not public.delivery_puede_canal(v_canal, 'lectura') then
    raise exception 'No tienes permiso en %.', case when v_canal = 'carga_pesada' then 'Carga pesada' else 'Delivery' end using errcode = '42501';
  end if;
  v_desde := public.delivery_desde();
  -- Los retiros en Almacén Los Pinos son solo de Delivery.
  v_alm := v_canal = 'delivery' and public.delivery_almacen_habilitado();
  return query
  with vivos as (
    select distinct on (d.orden_id, d.origen) d.* from public.delivery_pedidos d
    order by d.orden_id, d.origen, (d.estado <> 'cancelado') desc, d.created_at desc
  ),
  compra as (
    select o.id as orden_id, o.oc_codigo, o.codigo, o.total, coalesce(o.total_moneda, 'USD') as moneda, coalesce(o.urgente, false) as urgente, o.pagada_en,
           o.items, o.notas, o.motivo, o.finalidad, o.almacen_destino,
           p.id as proveedor_id, p.razon_social as proveedor_nombre, p.telefono as proveedor_telefono, p.direccion as proveedor_direccion, p.contacto as proveedor_contacto,
           coalesce(o.oc_creada_por, o.aprobada_por) as analista_email,
           public.delivery_nombre_usuario(coalesce(o.oc_creada_por, o.aprobada_por)) as analista_nombre,
           (select u.telefono from public.usuarios u where lower(u.email) = lower(coalesce(o.oc_creada_por, o.aprobada_por)) limit 1) as analista_telefono,
           v.id as pedido_id,
           case when rec.si then 'cancelado' else coalesce(v.estado, 'por_tomar') end as estado,
           v.repartidor_id, v.repartidor_nombre, v.aceptado_en, v.en_ruta_en,
           v.entregado_en,
           case when rec.si then o.recibida_en else v.cancelado_en end as cancelado_en,
           case when rec.si then 'Recibida por Almacén' else v.motivo_cancel end as motivo_cancel,
           case when rec.si then 'Almacén recibió la orden antes de que el delivery la entregara.' else v.detalle_cancel end as detalle_cancel,
           v.almacen_entrega, v.nota_entrega,
           coalesce(v.fotos_recibo, '[]'::jsonb) as fotos_recibo, coalesce(v.fotos_entrega, '[]'::jsonb) as fotos_entrega, coalesce(v.historial, '[]'::jsonb) as historial,
           coalesce(v.repartidor_id = v_uid, false) as es_mio,
           'compra'::text as origen, o.unidad_solicitante,
           coalesce(nullif(btrim(o.solicitante), ''), public.delivery_nombre_usuario(o.solicitante_email)) as solicitante_nombre,
           (select u.telefono from public.usuarios u where lower(u.email) = lower(o.solicitante_email) limit 1) as solicitante_telefono,
           null::timestamptz as revisada_en
    from public.ordenes o
    left join public.proveedores p on p.id = o.proveedor_id
    left join vivos v on v.orden_id = o.id and v.origen = 'compra'
    cross join lateral (select (v.id is not null and v.estado in ('aceptado', 'en_ruta') and o.recibida_en is not null) as si) rec
    where coalesce(o.tipo, 'producto') = 'producto'
      and o.oc_codigo is not null
      and (
        -- por tomar: solo las del canal (las «a domicilio» no entran a ninguno)
        (v_desde is not null and o.estado = 'pagada' and o.recibida_en is null and o.created_at >= v_desde
          and public.delivery_canal_orden(o.modalidad_entrega) = v_canal
          and (v.id is null or v.estado = 'cancelado'))
        -- en curso / cerradas: las del canal (si se tomó antes de cambiar la modalidad, sigue visible donde se tomó)
        or (v.id is not null and v.estado in ('aceptado', 'en_ruta') and not rec.si
            and (public.delivery_canal_orden(o.modalidad_entrega) = v_canal or (v_canal = 'delivery' and o.modalidad_entrega = 'proveedor')))
        or (p_incluir_cerrados and v.id is not null and (v.estado in ('entregado', 'cancelado') or rec.si)
            and (public.delivery_canal_orden(o.modalidad_entrega) = v_canal or (v_canal = 'delivery' and o.modalidad_entrega = 'proveedor')))
      )
  ),
  almacen as (
    select o.id as orden_id, null::text as oc_codigo, o.codigo, 0::numeric as total, 'USD'::text as moneda, coalesce(o.urgente, false) as urgente, null::timestamptz as pagada_en,
           public.delivery_items_los_pinos(r.items_revision) as items, r.nota as notas, o.motivo, o.finalidad, null::text as almacen_destino,
           null::uuid as proveedor_id, 'Almacén Los Pinos'::text as proveedor_nombre, null::text as proveedor_telefono, null::text as proveedor_direccion,
           r.revisada_por_nombre as proveedor_contacto,
           r.revisada_por as analista_email,
           coalesce(r.revisada_por_nombre, public.delivery_nombre_usuario(r.revisada_por)) as analista_nombre,
           (select u.telefono from public.usuarios u where lower(u.email) = lower(r.revisada_por) limit 1) as analista_telefono,
           v.id as pedido_id, coalesce(v.estado, 'por_tomar') as estado, v.repartidor_id, v.repartidor_nombre, v.aceptado_en, v.en_ruta_en,
           v.entregado_en, v.cancelado_en, v.motivo_cancel, v.detalle_cancel, v.almacen_entrega, v.nota_entrega,
           coalesce(v.fotos_recibo, '[]'::jsonb) as fotos_recibo, coalesce(v.fotos_entrega, '[]'::jsonb) as fotos_entrega, coalesce(v.historial, '[]'::jsonb) as historial,
           coalesce(v.repartidor_id = v_uid, false) as es_mio,
           'almacen'::text as origen, o.unidad_solicitante,
           coalesce(nullif(btrim(o.solicitante), ''), public.delivery_nombre_usuario(o.solicitante_email)) as solicitante_nombre,
           (select u.telefono from public.usuarios u where lower(u.email) = lower(o.solicitante_email) limit 1) as solicitante_telefono,
           r.revisada_en
    from public.solicitudes_revision_almacen r
    join public.ordenes o on o.id = r.orden_id
    left join vivos v on v.orden_id = o.id and v.origen = 'almacen'
    where v_canal = 'delivery'
      and jsonb_array_length(public.delivery_items_los_pinos(r.items_revision)) > 0
      and (
        (v_alm and v_desde is not null and r.estado = 'revisada' and r.revisada_en >= v_desde
          and o.estado not in ('cancelada', 'rechazada') and o.eliminando_at is null
          and (v.id is null or v.estado = 'cancelado'))
        or (v.id is not null and v.estado in ('aceptado', 'en_ruta'))
        or (p_incluir_cerrados and v.id is not null and v.estado in ('entregado', 'cancelado'))
      )
  )
  select x.* from (select * from compra union all select * from almacen) x
  order by x.urgente desc, coalesce(x.pagada_en, x.revisada_en) asc nulls last;
end $function$;

-- El listado viejo (llamadas sin canal) = Delivery.
create or replace function public.delivery_listado(p_incluir_cerrados boolean default false)
 RETURNS TABLE(orden_id uuid, oc_codigo text, codigo text, total numeric, moneda text, urgente boolean, pagada_en timestamp with time zone, items jsonb, notas text, motivo text, finalidad text, almacen_destino text, proveedor_id uuid, proveedor_nombre text, proveedor_telefono text, proveedor_direccion text, proveedor_contacto text, analista_email text, analista_nombre text, analista_telefono text, pedido_id uuid, estado text, repartidor_id uuid, repartidor_nombre text, aceptado_en timestamp with time zone, en_ruta_en timestamp with time zone, entregado_en timestamp with time zone, cancelado_en timestamp with time zone, motivo_cancel text, detalle_cancel text, almacen_entrega text, nota_entrega text, fotos_recibo jsonb, fotos_entrega jsonb, historial jsonb, es_mio boolean, origen text, unidad_solicitante text, solicitante_nombre text, solicitante_telefono text, revisada_en timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select * from public.delivery_listado_canal(p_incluir_cerrados, 'delivery');
$function$;

-- ── No disponible: «a domicilio» nunca; y cada rol solo toma su canal ──
create or replace function public.delivery_no_disponible_por(p_o public.ordenes, p_origen text, p_desde timestamp with time zone)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_r public.solicitudes_revision_almacen; v_canal text;
begin
  if p_origen = 'compra' then
    if p_o.estado <> 'pagada' or p_o.recibida_en is not null or coalesce(p_o.tipo, 'producto') <> 'producto'
       or p_o.oc_codigo is null or p_o.created_at < p_desde then
      return format('La orden %s ya no está disponible para delivery (estado: %s).', coalesce(p_o.oc_codigo, p_o.codigo), p_o.estado);
    end if;
    v_canal := public.delivery_canal_orden(p_o.modalidad_entrega);
    if v_canal = 'proveedor' then
      return format('La orden %s es CON ENTREGA A DOMICILIO: la trae el proveedor.', coalesce(p_o.oc_codigo, p_o.codigo));
    end if;
    if not public.delivery_puede_canal(v_canal, 'escritura') then
      return format('La orden %s es de %s: no la puedes tomar.', coalesce(p_o.oc_codigo, p_o.codigo),
        case when v_canal = 'carga_pesada' then 'CARGA PESADA' else 'DELIVERY' end);
    end if;
    return null;
  end if;
  if not public.puede('delivery') then
    return 'Los retiros en Almacén Los Pinos son de Delivery.';
  end if;
  if not public.delivery_almacen_habilitado() then
    return 'Los retiros en Almacén Los Pinos todavía no están habilitados en Delivery.';
  end if;
  select * into v_r from public.solicitudes_revision_almacen where orden_id = p_o.id;
  if v_r.id is null or v_r.estado <> 'revisada' or v_r.revisada_en < p_desde
     or jsonb_array_length(public.delivery_items_los_pinos(v_r.items_revision)) = 0
     or p_o.estado in ('cancelada', 'rechazada') or p_o.eliminando_at is not null then
    return format('La solicitud %s no tiene nada para retirar en Almacén Los Pinos (o ya no está disponible).', p_o.codigo);
  end if;
  return null;
end $function$;

-- ── Aviso al pagar: al rol del canal; «a domicilio» no avisa a nadie ──
create or replace function public.ordenes_a_delivery()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_desde timestamptz; v_prov text; v_dedup text; v_canal text;
begin
  begin
    if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
      return null;
    end if;
    v_desde := public.delivery_desde();
    v_canal := public.delivery_canal_orden(new.modalidad_entrega);
    if v_desde is null
       or v_canal = 'proveedor'
       or new.estado is distinct from 'pagada'::public.estado_orden
       or coalesce(new.tipo, 'producto') <> 'producto'
       or new.oc_codigo is null
       or new.recibida_en is not null
       or new.created_at < v_desde then
      return null;
    end if;
    v_dedup := 'del-disp-' || new.id::text;
    if exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup)
       or exists (select 1 from public.delivery_pedidos d where d.orden_id = new.id and d.origen = 'compra' and d.estado <> 'cancelado') then
      return null;
    end if;
    select nullif(btrim(p.razon_social), '') into v_prov from public.proveedores p where p.id = new.proveedor_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values (v_canal, 'info',
      case when v_canal = 'carga_pesada' then '🚛 OC ' || new.oc_codigo || ' de carga pesada lista para buscar'
           else '🛵 OC ' || new.oc_codigo || ' lista para buscar' end,
      'OC ' || new.oc_codigo || ' pagada' || coalesce(' · proveedor ' || v_prov, '')
        || case when coalesce(new.urgente, false) then ' · URGENTE' else '' end
        || case when v_canal = 'carga_pesada' then '. Tómala en Carga pesada.' else '. Tómala en Delivery.' end,
      case when v_canal = 'carga_pesada' then '#/app/carga-pesada/telefono' else '#/app/delivery/telefono' end, v_dedup);
  exception when others then
    raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm;
  end;
  return null;
end $function$;

-- ── Lectura (RLS) y fotos: también para Carga pesada ──
create policy "delivery_pedidos read carga pesada" on public.delivery_pedidos
  for select to authenticated using ((select public.puede_leer('carga_pesada')));
create policy "delivery_rechazos read carga pesada" on public.delivery_rechazos
  for select to authenticated using ((select public.puede_leer('carga_pesada')));
create policy "delivery_ubicaciones read carga pesada" on public.delivery_ubicaciones
  for select to authenticated using ((select public.puede_leer('carga_pesada')));
create policy "delivery_lugares read carga pesada" on public.delivery_lugares
  for select to authenticated using ((select public.puede_leer('carga_pesada')));
create policy "delivery_rastro read carga pesada" on public.delivery_rastro
  for select to authenticated using ((select public.puede_leer('carga_pesada')));
create policy "delivery-fotos read carga pesada" on storage.objects
  for select to authenticated using (bucket_id = 'delivery-fotos' and (select public.puede_leer('carga_pesada')));
create policy "delivery-fotos insert carga pesada" on storage.objects
  for insert to authenticated with check (bucket_id = 'delivery-fotos' and (select public.puede('carga_pesada'))
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibo|entrega)-[^/]{1,200}$');

grant execute on function public.delivery_listado_canal(boolean, text) to authenticated;
grant execute on function public.delivery_puede_canal(text, text) to authenticated;
grant execute on function public.delivery_canal_orden(text) to authenticated;

-- ── Contacto de analistas y editar fotos: también Carga pesada (misma función, otro permiso) ──
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.delivery_contacto_analistas(text[])'::regprocedure);
  if position('public.puede_leer(''delivery'')' in v_def) > 0 then
    execute replace(v_def, 'public.puede_leer(''delivery'')', 'public.delivery_puede(''lectura'')');
  end if;
  v_def := pg_get_functiondef('public.delivery_editar_fotos(uuid, text, jsonb)'::regprocedure);
  if position('public.puede(''delivery'')' in v_def) > 0 then
    execute replace(v_def, 'public.puede(''delivery'')', 'public.delivery_puede(''escritura'')');
  end if;
end $$;
