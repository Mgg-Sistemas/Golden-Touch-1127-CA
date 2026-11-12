-- 11/11/2026 · Facturas de la OC: «FACTURAS DELIVERY» y «FACTURAS ALMACÉN».
--
-- · El delivery tiene ahora dos botones: «CARGAR FACTURA» (fotos de la factura del
--   proveedor → delivery_pedidos.fotos_factura) y «CARGAR FOTO ENTREGA EN ALMACÉN»
--   (las fotos_entrega de siempre).
-- · El almacenista, al recepcionar (PC o teléfono), carga la factura: va a
--   adjuntos_directos (modulo 'orden_factura'), igual que las de Compras. Hasta hoy
--   esa tabla solo la escribía quien tenía Pedidos; ahora Inventario puede AGREGAR
--   facturas de OC (no borrar ni cambiar las de otros).
-- · En Compras, el botón «🧾 Factura» de la OC recibida muestra las dos listas
--   (orden_facturas_delivery lee las del delivery).

alter table public.delivery_pedidos
  add column if not exists fotos_factura jsonb not null default '[]'::jsonb;

comment on column public.delivery_pedidos.fotos_factura is
  'Fotos de la factura del proveedor que sube el delivery («CARGAR FACTURA»). [{path, filename}]';

-- Fotos del delivery: se suma el tipo 'factura'.
create or replace function public.delivery_fotos(p_pedido_id uuid, p_tipo text, p_fotos jsonb)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path to ''
as $function$
declare v_d public.delivery_pedidos; f jsonb;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_tipo not in ('recibo', 'entrega', 'factura') then raise exception 'Tipo de foto inválido.' using errcode = '23514'; end if;
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) > 6 then
    raise exception 'Se pueden adjuntar hasta 6 fotos.' using errcode = '23514';
  end if;
  for f in select x from jsonb_array_elements(p_fotos) x loop
    if jsonb_typeof(f) <> 'object' or coalesce(f ->> 'path', '') not like p_pedido_id::text || '/' || p_tipo || '-%'
       or position('..' in coalesce(f ->> 'path', '')) > 0 then
      raise exception 'La foto % no corresponde a este pedido.', coalesce(f ->> 'path', '?') using errcode = '23514';
    end if;
  end loop;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.repartidor_id <> auth.uid() and not public.delivery_puede('full') then
    raise exception 'Solo el delivery que tomó el pedido puede subir sus fotos.' using errcode = '42501';
  end if;
  update public.delivery_pedidos set
    fotos_recibo = case when p_tipo = 'recibo' then p_fotos else fotos_recibo end,
    fotos_entrega = case when p_tipo = 'entrega' then p_fotos else fotos_entrega end,
    fotos_factura = case when p_tipo = 'factura' then p_fotos else fotos_factura end,
    updated_at = now()
  where id = p_pedido_id returning * into v_d;
  return v_d;
end $function$;

create or replace function public.delivery_editar_fotos(p_pedido_id uuid, p_tipo text, p_fotos jsonb)
returns public.delivery_pedidos
language plpgsql
security definer
set search_path to ''
as $function$
declare v_d public.delivery_pedidos; f jsonb; v_email text; v_antes int;
begin
  if p_tipo not in ('recibo', 'entrega', 'factura') then raise exception 'Tipo de foto inválido.' using errcode = '23514'; end if;
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) > 6 then
    raise exception 'Se pueden adjuntar hasta 6 fotos.' using errcode = '23514';
  end if;
  for f in select x from jsonb_array_elements(p_fotos) x loop
    if jsonb_typeof(f) <> 'object' or coalesce(f ->> 'path', '') not like p_pedido_id::text || '/' || p_tipo || '-%'
       or position('..' in coalesce(f ->> 'path', '')) > 0 then
      raise exception 'La foto % no corresponde a este pedido.', coalesce(f ->> 'path', '?') using errcode = '23514';
    end if;
  end loop;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.estado <> 'entregado' then
    raise exception 'Solo se pueden editar las fotos de un pedido entregado.' using errcode = 'P0001';
  end if;
  if not (public.is_admin() or public.delivery_puede('escritura') or v_d.repartidor_id = auth.uid()) then
    raise exception 'No tienes permiso para editar las fotos de este pedido.' using errcode = '42501';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_antes := jsonb_array_length(case p_tipo when 'recibo' then coalesce(v_d.fotos_recibo, '[]')
                                            when 'entrega' then coalesce(v_d.fotos_entrega, '[]')
                                            else coalesce(v_d.fotos_factura, '[]') end);
  update public.delivery_pedidos set
    fotos_recibo = case when p_tipo = 'recibo' then p_fotos else fotos_recibo end,
    fotos_entrega = case when p_tipo = 'entrega' then p_fotos else fotos_entrega end,
    fotos_factura = case when p_tipo = 'factura' then p_fotos else fotos_factura end,
    historial = historial || jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'fotos_editadas', 'actor', v_email,
      'motivo', (case p_tipo when 'recibo' then 'Fotos al retirar' when 'entrega' then 'Fotos al entregar' else 'Fotos de la factura' end)
                || ': ' || v_antes || ' → ' || jsonb_array_length(p_fotos))),
    updated_at = now()
  where id = p_pedido_id returning * into v_d;
  return v_d;
end $function$;

-- Lo que el almacenista ve por recepcionar trae también las fotos de la factura.
create or replace function public.delivery_por_recepcionar()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not (public.is_admin() or public.puede('inventario')) then
    raise exception 'No tienes permiso de escritura en Inventario.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'pedido_id', d.id, 'orden_id', o.id, 'sp', o.codigo, 'oc', o.oc_codigo,
      'proveedor', nullif(btrim(p.razon_social), ''), 'proveedor_rif', p.rif,
      'solicitante', o.solicitante, 'unidad_solicitante', o.unidad_solicitante,
      'analista', public.delivery_nombre_usuario(coalesce(o.oc_creada_por, o.oc_emitida_por, o.metodo_pago_por)),
      'delivery', coalesce(d.repartidor_nombre, public.delivery_nombre_usuario(d.repartidor_email)),
      'entregado_en', d.entregado_en, 'almacen_entrega', d.almacen_entrega, 'nota_entrega', d.nota_entrega,
      'fotos_recibo', d.fotos_recibo, 'fotos_entrega', d.fotos_entrega, 'fotos_factura', d.fotos_factura,
      'comprobante_tipo', o.comprobante_tipo,
      'items', o.items, 'total', o.total, 'almacen_destino', o.almacen_destino, 'urgente', o.urgente
    ) order by d.entregado_en)
    from public.delivery_pedidos d
    join public.ordenes o on o.id = d.orden_id
    left join public.proveedores p on p.id = o.proveedor_id
    where d.origen = 'compra' and d.estado = 'entregado' and d.recepcionado_en is null and o.recibida_en is null
  ), '[]'::jsonb);
end $function$;

-- Las fotos de factura que subió el delivery para una OC (para «🧾 Factura» en Compras).
create or replace function public.orden_facturas_delivery(p_orden_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not (public.is_admin() or public.puede_leer('compras') or public.puede_leer('pedidos')
          or public.puede_leer('inventario') or public.puede_leer('delivery') or public.puede_leer('tesoreria')
          or public.puede_leer('retenciones')) then
    raise exception 'No tienes permiso para ver las facturas de esta orden.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'pedido_id', d.id, 'repartidor', coalesce(d.repartidor_nombre, d.repartidor_email),
      'entregado_en', d.entregado_en, 'fotos', d.fotos_factura) order by d.created_at)
    from public.delivery_pedidos d
    where d.orden_id = p_orden_id and jsonb_array_length(coalesce(d.fotos_factura, '[]'::jsonb)) > 0
  ), '[]'::jsonb);
end $function$;
grant execute on function public.orden_facturas_delivery(uuid) to authenticated;

-- Storage: el prefijo 'factura-' también es una foto válida del delivery.
alter policy "delivery-fotos insert" on storage.objects
  with check ((bucket_id = 'delivery-fotos') and ((select public.is_admin()) or (select public.puede('delivery')))
    and (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibo|entrega|factura)-[^/]{1,200}$'));
alter policy "delivery-fotos insert carga pesada" on storage.objects
  with check ((bucket_id = 'delivery-fotos') and (select public.puede('carga_pesada'))
    and (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibo|entrega|factura)-[^/]{1,200}$'));
alter policy "delivery-fotos delete" on storage.objects
  using ((bucket_id = 'delivery-fotos')
    and (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibo|entrega|factura)-[^/]{1,200}$')
    and exists (select 1 from public.delivery_pedidos d
                 where d.id = (split_part(objects.name, '/', 1))::uuid and d.estado = 'entregado'
                   and ((select public.is_admin()) or (select public.puede('delivery')) or d.repartidor_id = (select auth.uid()))));
-- Compras (permiso nuevo «compras») también ve las fotos del delivery.
alter policy "delivery-fotos read" on storage.objects
  using ((bucket_id = 'delivery-fotos') and ((select public.is_admin()) or (select public.puede_leer('delivery'))
    or (select public.puede_leer('pedidos')) or (select public.puede_leer('compras'))));

-- Inventario puede AGREGAR facturas de OC (el almacenista al recepcionar).
create policy "adjuntos_directos insert factura inventario" on public.adjuntos_directos
  for insert to authenticated
  with check (modulo = 'orden_factura' and (select public.puede('inventario')));

-- Lectura de las fotos de factura para el tablero y el teléfono del delivery
-- (delivery_listado_canal devuelve una tabla fija; se completan aparte, como la sede).
create or replace function public.delivery_fotos_factura(p_pedido_ids uuid[])
returns table(pedido_id uuid, fotos_factura jsonb)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not (public.is_admin() or public.puede_leer('delivery') or public.puede_leer('carga_pesada')
          or public.puede_leer('inventario') or public.puede_leer('compras') or public.puede_leer('pedidos')) then
    raise exception 'No tienes permiso para ver estas fotos.' using errcode = '42501';
  end if;
  return query
    select d.id, coalesce(d.fotos_factura, '[]'::jsonb)
      from public.delivery_pedidos d
     where d.id = any(p_pedido_ids);
end $function$;
grant execute on function public.delivery_fotos_factura(uuid[]) to authenticated;
