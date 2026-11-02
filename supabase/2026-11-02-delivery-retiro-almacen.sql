-- =====================================================================
-- 2026-11-02 · DELIVERY: RETIRO EN ALMACÉN LOS PINOS
-- ---------------------------------------------------------------------
-- Pedido de la usuaria: «cuando la Solicitud de Pedido se marque que HAY
-- EXISTENCIAS EN LOS PINOS, le debe llegar el pedido al DELIVERY para que
-- busque esos materiales».
--
-- Modelo:
--   · delivery_pedidos.origen: 'compra' (la OC pagada que se busca donde el
--     proveedor, como hasta ahora) | 'almacen' (retiro en Almacén Los Pinos de
--     lo que la revisión de Almacén marcó como disponible). En los dos casos
--     orden_id = la fila de public.ordenes (la SP y su OC son la misma fila).
--   · Una toma viva por (orden_id, origen): la misma SP puede tener su retiro
--     de Almacén Y, más tarde, su OC pagada.
--   · delivery_listado(p_incluir_cerrados): el listado CON origen (columnas
--     nuevas origen, unidad_solicitante, solicitante_nombre,
--     solicitante_telefono, revisada_en). Para un retiro: oc_codigo null
--     (se ve la SP), proveedor = «Almacén Los Pinos», items = lo que sale de
--     Los Pinos, analista_* = el almacenista que revisó, total 0.
--     delivery_pedidos_listado (el de antes) queda con la MISMA forma y solo
--     OC (el MCP no deja DROP, y cambiar las columnas de salida lo exige).
--   · delivery_tomar_origen(p_orden_id, p_origen default 'compra'); el viejo
--     delivery_tomar(uuid) llama a este con 'compra' (agregarle un parámetro
--     con default lo dejaría ambiguo para PostgREST sin poder borrar el viejo).
--   · delivery_avanzar: el retiro se entrega A una unidad/persona (va en
--     almacen_entrega, obligatorio); su cancelación avisa «Retiro … disponible
--     otra vez» (dedup del-alm-<orden>-c<pedido>).
--   · delivery_comprobante_pago: para un retiro (SP sin pagar) responde
--     aplica=false con un mensaje, sin error.
--   · Aviso al rol delivery cuando Almacén marca una revisión con algo de Los
--     Pinos: trigger trg_revision_almacen_a_delivery → «📦 Retiro en Almacén
--     Los Pinos · SP-xxxx · N renglones» (dedup del-alm-<orden>; al tomarlo
--     queda leído).
--   · ordenes_a_delivery (aviso de OC pagada) solo mira tomas de compra.
--
-- ⚠ PENDIENTE (requiere aprobación de la usuaria): borrar el índice viejo
--   delivery_pedidos_una_viva (orden_id) — ver migración 2 abajo. El
--   clasificador de permisos rechazó el DROP INDEX. Mientras exista, la
--   función delivery_almacen_habilitado() da FALSE y los retiros de Almacén
--   quedan APAGADOS (no se listan, no se avisan, no se pueden tomar): así el
--   flujo de OC no se rompe (con el índice viejo, un retiro entregado
--   impediría tomar después la OC de la misma SP). En cuanto se borre el
--   índice, todo se enciende solo.
--
-- Aplicado en Supabase GT (rroohciwhpfonklxuoev) el 02/11/2026:
--   delivery_almacen_1_origen
--   delivery_almacen_3_funciones
--   delivery_almacen_4_aviso_revision
--   delivery_almacen_5_aceptar_en_camino_y_no_disponible   (pedido 2 de la usuaria, abajo)
-- NO aplicado (rechazado: DROP):
--   delivery_almacen_2_indice_viejo
-- =====================================================================


-- =====================================================================
-- 1) delivery_almacen_1_origen
-- =====================================================================
alter table public.delivery_pedidos add column if not exists origen text not null default 'compra';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_pedidos_origen_check') then
    alter table public.delivery_pedidos add constraint delivery_pedidos_origen_check check (origen in ('compra', 'almacen'));
  end if;
end $$;
comment on column public.delivery_pedidos.origen is '02/11/2026: compra = OC pagada que se busca donde el proveedor; almacen = retiro en Almacén Los Pinos de lo que la revisión de Almacén marcó como disponible (orden_id = la SP).';
-- Una toma viva por (orden, origen): la misma SP puede tener su retiro de Almacén y, después, su OC pagada.
create unique index if not exists delivery_pedidos_una_viva_origen on public.delivery_pedidos (orden_id, origen) where estado <> 'cancelado';


-- =====================================================================
-- 2) delivery_almacen_2_indice_viejo — PENDIENTE DE APROBACIÓN
--    Correr en el SQL Editor de Supabase (o aprobar la migración):
-- =====================================================================
-- drop index if exists public.delivery_pedidos_una_viva;


-- =====================================================================
-- 3) delivery_almacen_3_funciones
-- =====================================================================

-- ¿Ya se puede tomar un retiro de Almacén? Hace falta que no exista el índice viejo
-- delivery_pedidos_una_viva (una toma viva por orden, SIN origen).
create or replace function public.delivery_almacen_habilitado() returns boolean
language sql stable security definer set search_path = '' as $$
  select to_regclass('public.delivery_pedidos_una_viva') is null;
$$;

-- Lo que sale de Los Pinos en una revisión de Almacén: [{nombre, cantidad, unidad}].
-- Sin desglose por almacén (revisiones viejas), todo lo disponible es de Los Pinos.
create or replace function public.delivery_items_los_pinos(p_items_revision jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', x ->> 'nombre', 'cantidad', q.n, 'unidad', x ->> 'unidad') order by t.ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_items_revision) = 'array' then p_items_revision else '[]'::jsonb end) with ordinality as t(x, ord)
    cross join lateral (select coalesce(
        case when jsonb_typeof(x -> 'por_almacen') = 'object' then nullif(x -> 'por_almacen' ->> 'los_pinos', '')::numeric end,
        nullif(x ->> 'cantidad_disponible', '')::numeric, 0) as n) q
   where q.n > 0;
$$;

-- Listado con ORIGEN: las OC pagadas (compra) y los retiros en Almacén Los Pinos (almacen).
create or replace function public.delivery_listado(p_incluir_cerrados boolean default false)
returns table (
  orden_id uuid, oc_codigo text, codigo text, total numeric, moneda text, urgente boolean, pagada_en timestamptz,
  items jsonb, notas text, motivo text, finalidad text, almacen_destino text,
  proveedor_id uuid, proveedor_nombre text, proveedor_telefono text, proveedor_direccion text, proveedor_contacto text,
  analista_email text, analista_nombre text, analista_telefono text,
  pedido_id uuid, estado text, repartidor_id uuid, repartidor_nombre text, aceptado_en timestamptz, en_ruta_en timestamptz,
  entregado_en timestamptz, cancelado_en timestamptz, motivo_cancel text, detalle_cancel text, almacen_entrega text,
  nota_entrega text, fotos_recibo jsonb, fotos_entrega jsonb, historial jsonb, es_mio boolean,
  origen text, unidad_solicitante text, solicitante_nombre text, solicitante_telefono text, revisada_en timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_desde timestamptz; v_alm boolean;
begin
  if not public.delivery_puede('lectura') then
    raise exception 'No tienes permiso en Delivery.' using errcode = '42501';
  end if;
  v_desde := public.delivery_desde();
  v_alm := public.delivery_almacen_habilitado();
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
           v.id as pedido_id, coalesce(v.estado, 'por_tomar') as estado, v.repartidor_id, v.repartidor_nombre, v.aceptado_en, v.en_ruta_en,
           v.entregado_en, v.cancelado_en, v.motivo_cancel, v.detalle_cancel, v.almacen_entrega, v.nota_entrega,
           coalesce(v.fotos_recibo, '[]'::jsonb) as fotos_recibo, coalesce(v.fotos_entrega, '[]'::jsonb) as fotos_entrega, coalesce(v.historial, '[]'::jsonb) as historial,
           coalesce(v.repartidor_id = v_uid, false) as es_mio,
           'compra'::text as origen, o.unidad_solicitante,
           coalesce(nullif(btrim(o.solicitante), ''), public.delivery_nombre_usuario(o.solicitante_email)) as solicitante_nombre,
           (select u.telefono from public.usuarios u where lower(u.email) = lower(o.solicitante_email) limit 1) as solicitante_telefono,
           null::timestamptz as revisada_en
    from public.ordenes o
    left join public.proveedores p on p.id = o.proveedor_id
    left join vivos v on v.orden_id = o.id and v.origen = 'compra'
    where coalesce(o.tipo, 'producto') = 'producto'
      and o.oc_codigo is not null
      and (
        (v_desde is not null and o.estado = 'pagada' and o.recibida_en is null and o.created_at >= v_desde
          and (v.id is null or v.estado = 'cancelado'))
        or (v.id is not null and v.estado in ('aceptado', 'en_ruta'))
        or (p_incluir_cerrados and v.id is not null and v.estado in ('entregado', 'cancelado'))
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
    where jsonb_array_length(public.delivery_items_los_pinos(r.items_revision)) > 0
      and (
        -- disponible: revisada desde que se encendió Delivery, algo sale de Los Pinos y nadie lo tiene.
        (v_alm and v_desde is not null and r.estado = 'revisada' and r.revisada_en >= v_desde
          and o.estado not in ('cancelada', 'rechazada') and o.eliminando_at is null
          and (v.id is null or v.estado = 'cancelado'))
        or (v.id is not null and v.estado in ('aceptado', 'en_ruta'))
        or (p_incluir_cerrados and v.id is not null and v.estado in ('entregado', 'cancelado'))
      )
  )
  select x.* from (select * from compra union all select * from almacen) x
  order by x.urgente desc, coalesce(x.pagada_en, x.revisada_en) asc nulls last;
end $$;

-- El listado de antes (solo OC): misma forma, ahora mira solo las tomas de compra.
create or replace function public.delivery_pedidos_listado(p_incluir_cerrados boolean default false)
returns table (
  orden_id uuid, oc_codigo text, codigo text, total numeric, moneda text, urgente boolean, pagada_en timestamptz,
  items jsonb, notas text, motivo text, finalidad text, almacen_destino text,
  proveedor_id uuid, proveedor_nombre text, proveedor_telefono text, proveedor_direccion text, proveedor_contacto text,
  analista_email text, analista_nombre text, analista_telefono text,
  pedido_id uuid, estado text, repartidor_id uuid, repartidor_nombre text, aceptado_en timestamptz, en_ruta_en timestamptz,
  entregado_en timestamptz, cancelado_en timestamptz, motivo_cancel text, detalle_cancel text, almacen_entrega text,
  nota_entrega text, fotos_recibo jsonb, fotos_entrega jsonb, historial jsonb, es_mio boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select l.orden_id, l.oc_codigo, l.codigo, l.total, l.moneda, l.urgente, l.pagada_en, l.items, l.notas, l.motivo, l.finalidad, l.almacen_destino,
         l.proveedor_id, l.proveedor_nombre, l.proveedor_telefono, l.proveedor_direccion, l.proveedor_contacto,
         l.analista_email, l.analista_nombre, l.analista_telefono,
         l.pedido_id, l.estado, l.repartidor_id, l.repartidor_nombre, l.aceptado_en, l.en_ruta_en,
         l.entregado_en, l.cancelado_en, l.motivo_cancel, l.detalle_cancel, l.almacen_entrega,
         l.nota_entrega, l.fotos_recibo, l.fotos_entrega, l.historial, l.es_mio
    from public.delivery_listado(p_incluir_cerrados) l
   where l.origen = 'compra';
end $$;

-- TOMAR con origen: 'compra' (la OC pagada) o 'almacen' (el retiro en Los Pinos de la SP).
create or replace function public.delivery_tomar_origen(p_orden_id uuid, p_origen text default 'compra') returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_o public.ordenes; v_r public.solicitudes_revision_almacen; v_ya public.delivery_pedidos; v_fila public.delivery_pedidos;
        v_email text; v_nombre text; v_desde timestamptz; v_origen text := coalesce(p_origen, 'compra');
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if v_origen not in ('compra', 'almacen') then
    raise exception 'Origen de pedido inválido: %.', v_origen using errcode = '23514';
  end if;
  v_desde := public.delivery_desde();
  if v_desde is null then
    raise exception 'Delivery todavía no está conectado a Compras.' using errcode = 'P0001';
  end if;
  select * into v_o from public.ordenes where id = p_orden_id for update;
  if v_o.id is null then raise exception 'No se encontró la orden.' using errcode = '23503'; end if;

  if v_origen = 'compra' then
    -- GT: sin condición de retención; solo productos y solo OC creadas desde que se encendió.
    if v_o.estado <> 'pagada' or v_o.recibida_en is not null or coalesce(v_o.tipo, 'producto') <> 'producto'
       or v_o.oc_codigo is null or v_o.created_at < v_desde then
      raise exception 'La orden % ya no está disponible para delivery (estado: %).', coalesce(v_o.oc_codigo, v_o.codigo), v_o.estado using errcode = 'P0001';
    end if;
  else
    if not public.delivery_almacen_habilitado() then
      raise exception 'Los retiros en Almacén Los Pinos todavía no están habilitados en Delivery.' using errcode = 'P0001';
    end if;
    select * into v_r from public.solicitudes_revision_almacen where orden_id = p_orden_id;
    if v_r.id is null or v_r.estado <> 'revisada' or v_r.revisada_en < v_desde
       or jsonb_array_length(public.delivery_items_los_pinos(v_r.items_revision)) = 0
       or v_o.estado in ('cancelada', 'rechazada') or v_o.eliminando_at is not null then
      raise exception 'La solicitud % no tiene nada para retirar en Almacén Los Pinos (o ya no está disponible).', v_o.codigo using errcode = 'P0001';
    end if;
  end if;

  select * into v_ya from public.delivery_pedidos where orden_id = p_orden_id and origen = v_origen and estado <> 'cancelado' limit 1;
  if v_ya.id is not null then
    raise exception 'Este pedido ya lo tomó %.', coalesce(v_ya.repartidor_nombre, v_ya.repartidor_email, 'otro delivery') using errcode = 'P0001';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_nombre := public.delivery_nombre_usuario(v_email);
  insert into public.delivery_pedidos (orden_id, origen, repartidor_id, repartidor_email, repartidor_nombre, historial)
  values (p_orden_id, v_origen, auth.uid(), v_email, v_nombre,
    jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'aceptado', 'actor', v_email, 'origen', v_origen)))
  returning * into v_fila;
  -- El aviso «disponible» ya está atendido.
  update public.notificaciones set read = true
   where dedup_key like (case when v_origen = 'almacen' then 'del-alm-' else 'del-disp-' end) || p_orden_id::text || '%' and read = false;
  return v_fila;
exception when unique_violation then
  raise exception 'Este pedido ya lo tomó otro delivery.' using errcode = 'P0001';
end $$;

-- El de antes: tomar la OC pagada (origen compra).
create or replace function public.delivery_tomar(p_orden_id uuid) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
begin
  return public.delivery_tomar_origen(p_orden_id, 'compra');
end $$;

-- Avanzar: igual que antes; el retiro de Almacén se ENTREGA A una unidad/persona
-- (va en almacen_entrega) y su cancelación avisa como retiro.
create or replace function public.delivery_avanzar(
  p_pedido_id uuid, p_estado text, p_motivo text default null, p_detalle text default null,
  p_almacen text default null, p_nota text default null
) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_d public.delivery_pedidos; v_email text; v_ok boolean; v_oc text; v_prov text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.repartidor_id <> auth.uid() and not public.delivery_puede('full') then
    raise exception 'Este pedido lo tiene %: solo él puede moverlo.', coalesce(v_d.repartidor_nombre, v_d.repartidor_email) using errcode = '42501';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_ok := (v_d.estado = 'aceptado' and p_estado in ('en_ruta', 'cancelado'))
       or (v_d.estado = 'en_ruta' and p_estado in ('entregado', 'cancelado'));
  if not v_ok then
    raise exception 'No se puede pasar de % a %.', v_d.estado, p_estado using errcode = 'P0001';
  end if;
  if p_estado = 'cancelado' and char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo por el que no se puede buscar el pedido.' using errcode = '23514';
  end if;
  if p_estado = 'entregado' and v_d.origen = 'almacen' and char_length(btrim(coalesce(p_almacen, ''))) < 2 then
    raise exception 'Indica a quién se lo entregaste (unidad o persona).' using errcode = '23514';
  end if;
  update public.delivery_pedidos set
    estado = p_estado,
    en_ruta_en = case when p_estado = 'en_ruta' then now() else en_ruta_en end,
    entregado_en = case when p_estado = 'entregado' then now() else entregado_en end,
    cancelado_en = case when p_estado = 'cancelado' then now() else cancelado_en end,
    motivo_cancel = case when p_estado = 'cancelado' then btrim(p_motivo) else motivo_cancel end,
    detalle_cancel = case when p_estado = 'cancelado' then nullif(btrim(coalesce(p_detalle, '')), '') else detalle_cancel end,
    almacen_entrega = case when p_estado = 'entregado' then nullif(btrim(coalesce(p_almacen, '')), '') else almacen_entrega end,
    nota_entrega = case when p_estado = 'entregado' then nullif(btrim(coalesce(p_nota, '')), '') else nota_entrega end,
    historial = historial || jsonb_build_array(jsonb_build_object('at', now(), 'evento', p_estado, 'actor', v_email,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), ''))),
    updated_at = now()
  where id = p_pedido_id
  returning * into v_d;

  -- GT: al cancelar, queda libre otra vez → aviso al rol delivery.
  if p_estado = 'cancelado' then
    update public.delivery_ubicaciones set pedido_id = null where pedido_id = v_d.id;
    if v_d.origen = 'almacen' then
      select o.codigo into v_oc from public.ordenes o where o.id = v_d.orden_id;
      insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
      values ('delivery', 'warning',
        '🔄 Retiro ' || coalesce(v_oc, '') || ' en Almacén Los Pinos disponible otra vez',
        coalesce(v_d.repartidor_nombre, 'Un delivery') || ' no puede retirarlo (' || btrim(p_motivo) || '). Está libre para otro delivery.',
        '#/app/delivery/telefono', 'del-alm-' || v_d.orden_id::text || '-c' || v_d.id::text);
    else
      select coalesce(o.oc_codigo, o.codigo), nullif(btrim(p.razon_social), '') into v_oc, v_prov
        from public.ordenes o left join public.proveedores p on p.id = o.proveedor_id where o.id = v_d.orden_id;
      insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
      values ('delivery', 'warning',
        '🔄 OC ' || coalesce(v_oc, '') || ' disponible otra vez',
        coalesce(v_d.repartidor_nombre, 'Un delivery') || ' no puede buscarla (' || btrim(p_motivo) || ')'
          || coalesce(' · proveedor ' || v_prov, '') || '. Está libre para otro delivery.',
        '#/app/delivery/telefono', 'del-disp-' || v_d.orden_id::text || '-c' || v_d.id::text);
    end if;
  end if;
  return v_d;
end $$;

-- Comprobante de pago: solo aplica a la OC. Para un retiro de Almacén (SP sin pagar)
-- responde claro, sin error: aplica = false.
create or replace function public.delivery_comprobante_pago(p_orden_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_o record;
begin
  if not public.delivery_puede('lectura') then
    raise exception 'No tienes permiso en Delivery.' using errcode = '42501';
  end if;
  select o.id, o.oc_codigo, o.codigo, o.pagada_en, o.total, o.total_moneda, o.comprobantes_pago, o.factura_path, o.factura_nombre, o.metodo_pago
    into v_o from public.ordenes o where o.id = p_orden_id;
  if not found then
    raise exception 'La orden no existe.';
  end if;
  if v_o.pagada_en is null
     and not exists (select 1 from public.delivery_pedidos d where d.orden_id = p_orden_id and d.origen = 'compra') then
    if exists (select 1 from public.delivery_pedidos d where d.orden_id = p_orden_id and d.origen = 'almacen')
       or exists (select 1 from public.solicitudes_revision_almacen r where r.orden_id = p_orden_id and r.estado = 'revisada') then
      return jsonb_build_object(
        'id', v_o.id, 'oc_codigo', v_o.oc_codigo, 'codigo', v_o.codigo, 'aplica', false,
        'mensaje', 'Retiro en Almacén Los Pinos: no lleva comprobante de pago.',
        'pagada_en', null, 'total', 0, 'total_moneda', coalesce(v_o.total_moneda, 'USD'),
        'comprobantes_pago', '[]'::jsonb, 'factura_path', null, 'factura_nombre', null, 'metodo_pago', '[]'::jsonb);
    end if;
    raise exception 'Esta orden todavía no está pagada.';
  end if;
  return jsonb_build_object(
    'id', v_o.id,
    'oc_codigo', v_o.oc_codigo,
    'aplica', true,
    'pagada_en', v_o.pagada_en,
    'total', v_o.total,
    'total_moneda', coalesce(v_o.total_moneda, 'USD'),
    'comprobantes_pago', coalesce(to_jsonb(v_o.comprobantes_pago), '[]'::jsonb),
    'factura_path', v_o.factura_path,
    'factura_nombre', v_o.factura_nombre,
    'metodo_pago', coalesce(to_jsonb(v_o.metodo_pago), '[]'::jsonb)
  );
end $$;

-- Aviso de OC pagada: la toma que cuenta es la de compra (un retiro de Almacén no la tapa).
create or replace function public.ordenes_a_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_desde timestamptz; v_prov text; v_dedup text;
begin
  begin
    if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
      return null;
    end if;
    v_desde := public.delivery_desde();
    if v_desde is null
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
    values ('delivery', 'info',
      '🛵 OC ' || new.oc_codigo || ' lista para buscar',
      'OC ' || new.oc_codigo || ' pagada' || coalesce(' · proveedor ' || v_prov, '')
        || case when coalesce(new.urgente, false) then ' · URGENTE' else '' end || '. Tómala en Delivery.',
      '#/app/delivery/telefono', v_dedup);
  exception when others then
    raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.delivery_almacen_habilitado() from public, anon;
revoke all on function public.delivery_items_los_pinos(jsonb) from public, anon;
revoke all on function public.delivery_listado(boolean) from public, anon;
revoke all on function public.delivery_tomar_origen(uuid, text) from public, anon;
grant execute on function public.delivery_almacen_habilitado() to authenticated;
grant execute on function public.delivery_items_los_pinos(jsonb) to authenticated;
grant execute on function public.delivery_listado(boolean) to authenticated;
grant execute on function public.delivery_tomar_origen(uuid, text) to authenticated;


-- =====================================================================
-- 4) delivery_almacen_4_aviso_revision
--    Aviso al rol delivery cuando Almacén marca una revisión con algo que
--    sale de Los Pinos. Nunca hace fallar la revisión.
-- =====================================================================
create or replace function public.revision_almacen_a_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_desde timestamptz; v_n int; v_dedup text; v_o record;
begin
  begin
    if new.estado is distinct from 'revisada' then return null; end if;
    if tg_op = 'UPDATE' and old.estado = 'revisada' and old.revisada_en is not distinct from new.revisada_en then
      return null;
    end if;
    v_desde := public.delivery_desde();
    if v_desde is null or not public.delivery_almacen_habilitado() or new.revisada_en is null or new.revisada_en < v_desde then
      return null;
    end if;
    v_n := jsonb_array_length(public.delivery_items_los_pinos(new.items_revision));
    if v_n = 0 then return null; end if;
    select o.codigo, o.unidad_solicitante, o.solicitante, o.urgente, o.estado, o.eliminando_at into v_o
      from public.ordenes o where o.id = new.orden_id;
    if v_o.codigo is null or v_o.estado in ('cancelada', 'rechazada') or v_o.eliminando_at is not null then
      return null;
    end if;
    v_dedup := 'del-alm-' || new.orden_id::text;
    if exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup and n.read = false)
       or exists (select 1 from public.delivery_pedidos d where d.orden_id = new.orden_id and d.origen = 'almacen' and d.estado <> 'cancelado') then
      return null;
    end if;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('delivery', 'info',
      '📦 Retiro en Almacén Los Pinos · ' || v_o.codigo || ' · ' || v_n || case when v_n = 1 then ' renglón' else ' renglones' end,
      'Almacén Los Pinos tiene listo lo de la ' || v_o.codigo
        || coalesce(' para ' || nullif(btrim(v_o.unidad_solicitante), ''), '')
        || coalesce(' (' || nullif(btrim(v_o.solicitante), '') || ')', '')
        || case when coalesce(v_o.urgente, false) then ' · URGENTE' else '' end || '. Tómalo en Delivery.',
      '#/app/delivery/telefono', v_dedup);
  exception when others then
    raise warning 'revision_almacen_a_delivery(%): %', new.orden_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.revision_almacen_a_delivery() from public, anon, authenticated;
comment on function public.revision_almacen_a_delivery() is '02/11/2026: avisa al rol delivery que hay un retiro en Almacén Los Pinos (revisión con algo de Los Pinos).';

create or replace trigger trg_revision_almacen_a_delivery
  after insert or update of estado, revisada_en, items_revision on public.solicitudes_revision_almacen
  for each row when (new.estado = 'revisada')
  execute function public.revision_almacen_a_delivery();


-- =====================================================================
-- PRUEBAS (02/11/2026) — bloque DO que termina en raise exception (todo
-- revertido). Usuarios: A = asistentecomprasgt2 (NAZARET SALAZAR, delivery
-- full), B = comprasanalista9 (KELVIN PEÑA), L = almacen.pzo.lospinos
-- (almacenista). SP de prueba SP-2026-9901/9902/9903 creadas y revisadas con
-- almacen_revisar_solicitud dentro de la transacción.
--   T0  índice viejo presente → delivery_almacen_habilitado() = false: revisión
--       con 2 renglones de Los Pinos → 0 avisos, no aparece en el listado,
--       tomar → «Los retiros en Almacén Los Pinos todavía no están
--       habilitados en Delivery.»; comprobante → aplica=false «Retiro en
--       Almacén Los Pinos: no lleva comprobante de pago.»                     OK
--   (desde aquí se simuló, solo en la transacción, el índice ya borrado:
--    create or replace delivery_almacen_habilitado() → true)
--   T1  revisión 4 de 10 guantes + 2 de 2 tornillos de Los Pinos → SP
--       'pendiente' (lo demás a Compras); aviso [delivery] «📦 Retiro en
--       Almacén Los Pinos · SP-2026-9902 · 2 renglones»; delivery_listado:
--       origen=almacen, por_tomar, proveedor «Almacén Los Pinos», destino
--       PRODUCCION / ENDER PRUEBA, items [GUANTES 4 und, TORNILLO 2 und];
--       delivery_pedidos_listado (viejo, solo OC) no lo trae.                  OK
--   T2  A toma (almacen) → aceptado, NAZARET SALAZAR, aviso leído; B segunda
--       toma → «Este pedido ya lo tomó NAZARET SALAZAR.»                      OK
--   T3  la misma SP pasa a OC pagada → aparece por tomar como 'compra' y
--       avisa «OC lista para buscar» (1); B toma la OC → «Este pedido ya lo
--       tomó otro delivery.» ← lo bloquea el índice viejo
--       delivery_pedidos_una_viva. PASA cuando se borre ese índice
--       (migración 2); por eso la compuerta mantiene apagados los retiros.    PENDIENTE
--   T4  revisión todo a Compras → 0 avisos, 0 filas en el listado.            OK
--   T5  en_ruta → entregar sin «Entregado a» → «Indica a quién se lo
--       entregaste (unidad o persona).»; con 'PRODUCCION · ENDER PRUEBA' →
--       entregado, historial 3 pasos; aparece en el listado con cerrados;
--       comprobante de la OC pagada → aplica=true.                            OK
-- Después (base real): compuerta en false, 0 filas en delivery_pedidos, 0 SP
-- de prueba, 0 avisos del-alm-%.
-- Ojo al encender (borrar el índice): hay 2 revisiones reales con algo de Los
-- Pinos revisadas después de encender Delivery (SP-2026-0391 · 4 guantes y
-- SP-2026-0399 · 1 aceite hidráulico) que aparecerán «Por tomar».
-- =====================================================================


-- =====================================================================
-- 5) delivery_almacen_5_aceptar_en_camino_y_no_disponible (02/11/2026)
--    Pedido de la usuaria (teléfono del motorizado):
--    · «✓ Aceptar pedido» pasa DIRECTO a EN CAMINO (estado en_ruta, con
--      aceptado_en = en_ruta_en = ahora); ya no hay estado intermedio. Si dos
--      aceptan a la vez, el candado de la orden los pone en fila y el segundo
--      recibe «Este pedido ya lo aceptó <nombre>.»
--    · «✕ No disponible» con motivo obligatorio → delivery_rechazos (quién,
--      cuándo, motivo). El pedido sigue libre para los demás; al que lo marcó
--      el teléfono ya no se lo muestra (lo filtra el front con esta tabla).
--    · delivery_no_disponible_por(): el mismo criterio de «está libre» para
--      aceptar y para «no disponible» (incluye la compuerta de Almacén).
--    (Reemplaza la versión de delivery_tomar_origen del paso 3.)
-- =====================================================================
create table if not exists public.delivery_rechazos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  origen text not null default 'compra' check (origen in ('compra', 'almacen')),
  repartidor_id uuid not null,
  repartidor_email text,
  repartidor_nombre text,
  motivo text not null check (char_length(btrim(motivo)) >= 3),
  created_at timestamptz not null default now()
);
create index if not exists delivery_rechazos_orden_idx on public.delivery_rechazos (orden_id, origen);
create index if not exists delivery_rechazos_repartidor_idx on public.delivery_rechazos (repartidor_id, created_at);
comment on table public.delivery_rechazos is '02/11/2026: «No disponible» del motorizado sobre un pedido por tomar (motivo obligatorio). El pedido sigue libre para los demás.';

alter table public.delivery_rechazos enable row level security;
revoke all on public.delivery_rechazos from anon;
revoke insert, update, delete, truncate, references, trigger on public.delivery_rechazos from authenticated;
grant select on public.delivery_rechazos to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_rechazos' and policyname = 'delivery_rechazos read') then
    create policy "delivery_rechazos read" on public.delivery_rechazos for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')) or (select public.puede_leer('pedidos')));
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_rechazos') then
    alter publication supabase_realtime add table public.delivery_rechazos;
  end if;
end $$;
create or replace trigger trg_aud_delivery_rechazos
  after insert or update or delete on public.delivery_rechazos
  for each row execute function public.fn_auditar();

-- ¿Está libre para tomar? null = sí; si no, el porqué (mismo criterio para aceptar y para «no disponible»).
create or replace function public.delivery_no_disponible_por(p_o public.ordenes, p_origen text, p_desde timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_r public.solicitudes_revision_almacen;
begin
  if p_origen = 'compra' then
    -- GT: sin condición de retención; solo productos y solo OC creadas desde que se encendió.
    if p_o.estado <> 'pagada' or p_o.recibida_en is not null or coalesce(p_o.tipo, 'producto') <> 'producto'
       or p_o.oc_codigo is null or p_o.created_at < p_desde then
      return format('La orden %s ya no está disponible para delivery (estado: %s).', coalesce(p_o.oc_codigo, p_o.codigo), p_o.estado);
    end if;
    return null;
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
end $$;
revoke all on function public.delivery_no_disponible_por(public.ordenes, text, timestamptz) from public, anon, authenticated;

-- ACEPTAR: queda directo EN CAMINO (en_ruta). Uno solo por (orden, origen).
create or replace function public.delivery_tomar_origen(p_orden_id uuid, p_origen text default 'compra') returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_o public.ordenes; v_ya public.delivery_pedidos; v_fila public.delivery_pedidos;
        v_email text; v_nombre text; v_desde timestamptz; v_origen text := coalesce(p_origen, 'compra'); v_err text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if v_origen not in ('compra', 'almacen') then
    raise exception 'Origen de pedido inválido: %.', v_origen using errcode = '23514';
  end if;
  v_desde := public.delivery_desde();
  if v_desde is null then
    raise exception 'Delivery todavía no está conectado a Compras.' using errcode = 'P0001';
  end if;
  -- El candado de la orden pone en fila a dos motorizados que aceptan a la vez.
  select * into v_o from public.ordenes where id = p_orden_id for update;
  if v_o.id is null then raise exception 'No se encontró la orden.' using errcode = '23503'; end if;
  v_err := public.delivery_no_disponible_por(v_o, v_origen, v_desde);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;

  select * into v_ya from public.delivery_pedidos where orden_id = p_orden_id and origen = v_origen and estado <> 'cancelado' limit 1;
  if v_ya.id is not null then
    raise exception 'Este pedido ya lo aceptó %.', coalesce(v_ya.repartidor_nombre, v_ya.repartidor_email, 'otro delivery') using errcode = 'P0001';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_nombre := public.delivery_nombre_usuario(v_email);
  insert into public.delivery_pedidos (orden_id, origen, estado, repartidor_id, repartidor_email, repartidor_nombre, aceptado_en, en_ruta_en, historial)
  values (p_orden_id, v_origen, 'en_ruta', auth.uid(), v_email, v_nombre, now(), now(),
    jsonb_build_array(
      jsonb_build_object('at', now(), 'evento', 'aceptado', 'actor', v_email, 'origen', v_origen),
      jsonb_build_object('at', now(), 'evento', 'en_ruta', 'actor', v_email)))
  returning * into v_fila;
  update public.notificaciones set read = true
   where dedup_key like (case when v_origen = 'almacen' then 'del-alm-' else 'del-disp-' end) || p_orden_id::text || '%' and read = false;
  return v_fila;
exception when unique_violation then
  raise exception 'Este pedido ya lo aceptó otro delivery.' using errcode = 'P0001';
end $$;

-- «No disponible»: el motorizado no puede buscarlo (motivo obligatorio). Sigue libre para los demás.
create or replace function public.delivery_rechazar(p_orden_id uuid, p_origen text default 'compra', p_motivo text default null)
returns public.delivery_rechazos
language plpgsql security definer set search_path = '' as $$
declare v_o public.ordenes; v_ya public.delivery_pedidos; v_fila public.delivery_rechazos;
        v_email text; v_desde timestamptz; v_origen text := coalesce(p_origen, 'compra'); v_err text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if v_origen not in ('compra', 'almacen') then
    raise exception 'Origen de pedido inválido: %.', v_origen using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo por el que no estás disponible.' using errcode = '23514';
  end if;
  v_desde := public.delivery_desde();
  if v_desde is null then
    raise exception 'Delivery todavía no está conectado a Compras.' using errcode = 'P0001';
  end if;
  select * into v_o from public.ordenes where id = p_orden_id;
  if v_o.id is null then raise exception 'No se encontró la orden.' using errcode = '23503'; end if;
  v_err := public.delivery_no_disponible_por(v_o, v_origen, v_desde);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
  select * into v_ya from public.delivery_pedidos where orden_id = p_orden_id and origen = v_origen and estado <> 'cancelado' limit 1;
  if v_ya.id is not null then
    raise exception 'Este pedido ya lo aceptó %.', coalesce(v_ya.repartidor_nombre, v_ya.repartidor_email, 'otro delivery') using errcode = 'P0001';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  insert into public.delivery_rechazos (orden_id, origen, repartidor_id, repartidor_email, repartidor_nombre, motivo)
  values (p_orden_id, v_origen, auth.uid(), v_email, public.delivery_nombre_usuario(v_email), btrim(p_motivo))
  returning * into v_fila;
  return v_fila;
end $$;

revoke all on function public.delivery_rechazar(uuid, text, text) from public, anon;
grant execute on function public.delivery_rechazar(uuid, text, text) to authenticated;

-- PRUEBAS paso 5 (02/11/2026, bloque DO revertido; OC-2026-9911 pagada y
-- SP-2026-9912 de prueba creadas dentro de la transacción):
--   R1 «No disponible» con motivo «x» → «Indica el motivo por el que no estás disponible.»  OK
--   R2 B «No disponible» (Estoy en otra entrega) → guardado KELVIN PEÑA; sigue por tomar (1). OK
--   R3 A acepta → estado en_ruta, en_ruta_en puesto, historial 2 pasos.                       OK
--   R4 B acepta después → «Este pedido ya lo aceptó NAZARET SALAZAR.»                         OK
--   R5 B «No disponible» ya aceptado → «Este pedido ya lo aceptó NAZARET SALAZAR.»            OK
--   R6 A entrega (en_ruta → entregado).                                                        OK
--   (compuerta de Almacén simulada abierta) R7 B «No disponible» del retiro → origen almacen;  OK
--   R8 A acepta el retiro → en_ruta; R9 B lo acepta después → «ya lo aceptó NAZARET SALAZAR».  OK
-- Después: 0 filas en delivery_rechazos y delivery_pedidos, compuerta en false.
