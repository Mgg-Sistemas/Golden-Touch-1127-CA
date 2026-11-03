-- =====================================================================
-- 2026-11-02 · DELIVERY ↔ RECEPCIÓN DE LA OC
-- ---------------------------------------------------------------------
-- Pedido de la usuaria:
--   1) Si la OC ya fue pagada Y Compras/Almacén ya la RECIBIÓ, al delivery
--      ya no le debe salir (ni «Por tomar» ni en el teléfono).
--   2) Cuando el motorizado marca «Entregado» de una OC (origen 'compra'),
--      la OC queda RECIBIDA en Inventario y la mercancía entra al almacén
--      (Los Pinos = 'General'). Servicios no suman stock. Retiros de Almacén
--      (origen 'almacen') NO mueven stock.
--
-- Cómo:
--   · La recepción de la app vive en el navegador (pedidos.repository.ts →
--     recibirOrdenParcial) y escribe con los permisos de Pedidos/Inventario,
--     que el motorizado no tiene. No hay RPC de recepción en la base. Por eso
--     delivery_recibir_oc() replica, en el servidor, las MISMAS reglas de esa
--     recepción con todas las cantidades (ver el comentario de la función).
--     Si se cambia recibirOrdenParcial, revisar también esta función.
--   · delivery_avanzar(…, 'entregado') de una OC llama a delivery_recibir_oc
--     (idempotente: si ya estaba recibida devuelve 'ya_recibida' y no suma).
--     Si no se puede (res en canal = falta el despiece, estado no recibible,
--     error), la ENTREGA igual queda, se anota en el historial del pedido
--     ('recepcion_inventario' + resultado) y se avisa al rol almacenista.
--   · OC recibida por el flujo normal mientras el delivery la tenía
--     (aceptada / en camino): delivery_listado la muestra CERRADA como
--     'cancelado' con motivo «Recibida por Almacén» (solo con cerrados: la PC
--     la ve, el teléfono no) y delivery_avanzar ya no la deja mover. «Por
--     tomar» ya exigía recibida_en null (también tomar / «No disponible»).
--   · Retiro de Almacén entregado: sin stock. No existe una salida automática
--     clara (las SP del flujo nuevo traen nombres genéricos, sin producto del
--     inventario): la salida la sigue registrando Almacén por Salidas.
--
-- Aplicado en Supabase GT (rroohciwhpfonklxuoev) el 02/11/2026:
--   delivery_recepcion_1_recibir_oc
--   delivery_recepcion_2_avanzar_recibe            (reemplazada por la 4)
--   delivery_recepcion_3_listado_recibida_por_almacen
--   delivery_recepcion_4_avanzar_bloquea_recibida
-- NO aplicado (rechazado por el clasificador de permisos: trigger en la tabla
-- ordenes): un trigger after update of recibida_en que cerrara de verdad la
-- toma viva en delivery_pedidos y avisara al motorizado. En su lugar, el
-- listado la muestra cerrada (paso 3) y avanzar la bloquea (paso 4); la fila
-- queda en 'en_ruta' en la tabla y el histórico de la PC la traduce igual.
-- =====================================================================


-- =====================================================================
-- 1) delivery_recepcion_1_recibir_oc
-- =====================================================================
-- Recepción COMPLETA de la OC cuando el delivery la entrega. Mismas reglas que
-- recibirOrdenParcial():
--   · estados recibibles: por_recibir, cuenta_abierta, pagada, oc_emitida, aprobada;
--   · SERVICIO o «no afecta inventario» → la orden queda recibida pero NO mueve stock;
--   · producto no_inventariable → no suma; presentación (factor) → entra cantidad×factor a precio÷factor;
--   · PMP: (stock·pmp + entra·precio)/(stock+entra); un pmp en 0 usa el precio de la ficha;
--   · almacén: el de la OC (almacen_destino), si no el del producto, si no 'General' (= Los Pinos);
--   · movimiento de ENTRADA ref_tipo 'orden', existencias por almacén, ficha con marca/modelo;
--   · la orden: estado recibida (o cuenta_abierta si es crédito sin saldar), items con
--     cantidad_recibida, recibido_total, recibida_por/en, historial «recibida» (via delivery).
-- Res en canal: necesita el despiece (cortes) que solo se carga a mano → no se recibe sola.
-- Devuelve: 'recibida' | 'ya_recibida' | 'no_recibible' | 'requiere_despiece' | 'no_existe'.
create or replace function public.delivery_recibir_oc(p_orden_id uuid, p_actor_email text, p_actor_nombre text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_o public.ordenes;
  v_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_afecta boolean;
  it jsonb;
  v_items jsonb := '[]'::jsonb;
  v_pid uuid; v_cant numeric; v_factor numeric; v_uso numeric; v_precio numeric; v_precio_uso numeric;
  v_prod record; v_antes numeric; v_despues numeric; v_pp numeric; v_actual numeric; v_alm text;
  v_ex numeric; v_total numeric := 0; v_estado public.estado_orden; v_saldado boolean;
  v_quien text := coalesce(nullif(btrim(p_actor_nombre), ''), p_actor_email, 'Delivery');
  v_marca text; v_modelo text;
begin
  select * into v_o from public.ordenes where id = p_orden_id for update;
  if v_o.id is null then return 'no_existe'; end if;
  if v_o.recibida_en is not null then return 'ya_recibida'; end if;
  if v_o.estado not in ('por_recibir', 'cuenta_abierta', 'pagada', 'oc_emitida', 'aprobada') then return 'no_recibible'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(v_o.items, '[]'::jsonb)) x
              where lower(public.sin_acentos(coalesce(x ->> 'nombre', ''))) like '%res en canal%') then
    return 'requiere_despiece';
  end if;

  v_afecta := coalesce(v_o.tipo, 'producto') <> 'servicio' and coalesce(v_o.afecta_inventario, true);

  for it in select x from jsonb_array_elements(coalesce(v_o.items, '[]'::jsonb)) x loop
    v_cant := greatest(coalesce(nullif(it ->> 'cantidad', '')::numeric, 0), 0);
    v_precio := coalesce(nullif(it ->> 'precio', '')::numeric, 0);
    v_marca := nullif(upper(btrim(coalesce(it ->> 'marca', ''))), '');
    v_modelo := nullif(upper(btrim(coalesce(it ->> 'modelo', ''))), '');
    v_total := v_total + v_cant * v_precio;
    v_items := v_items || jsonb_build_array(it || jsonb_build_object('cantidad_recibida', v_cant)
      || case when v_cant > 0 then jsonb_build_object('marca_recibida', v_marca, 'modelo_recibido', v_modelo) else '{}'::jsonb end);

    if not v_afecta or v_cant <= 0 then continue; end if;
    v_pid := case when coalesce(it ->> 'productoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (it ->> 'productoId')::uuid end;
    if v_pid is null then continue; end if;
    select p.stock, p.precio, p.precio_promedio, p.almacen, p.no_inventariable into v_prod
      from public.productos p where p.id = v_pid for update;
    if not found or coalesce(v_prod.no_inventariable, false) then continue; end if;

    v_factor := case when coalesce(nullif(it ->> 'factor', '')::numeric, 0) > 0 then (it ->> 'factor')::numeric else 1 end;
    v_uso := round(v_cant * v_factor, 4);
    v_precio_uso := round(v_precio / v_factor, 4);
    v_antes := coalesce(v_prod.stock, 0);
    v_despues := v_antes + v_uso;
    v_actual := case when coalesce(v_prod.precio_promedio, 0) > 0 then v_prod.precio_promedio else coalesce(v_prod.precio, 0) end;
    v_pp := case when v_despues > 0 then round((v_antes * v_actual + v_uso * v_precio_uso) / v_despues, 4) else v_precio_uso end;
    v_alm := coalesce(nullif(btrim(v_o.almacen_destino), ''), nullif(btrim(v_prod.almacen), ''), 'General');

    insert into public.movimientos (producto_id, tipo, delta, almacen, stock_antes, stock_despues, actor, actor_name,
      ref_tipo, ref_id, ref_codigo, proveedor_id, detalle, precio_unitario)
    values (v_pid, 'entrada', v_uso, v_alm, v_antes, v_despues, p_actor_email, v_quien,
      'orden', v_o.id::text, v_o.codigo, v_o.proveedor_id,
      concat_ws(' · ',
        format('Recepción de %s/%s %s @ %s (promedio: %s) → %s', v_cant, v_cant, coalesce(it ->> 'sku', ''),
          to_char(v_precio_uso, 'FM999999990.00'), to_char(v_pp, 'FM999999990.00'), v_alm),
        case when v_factor <> 1 then format('%s %s = %s %s (a %s el %s)', v_cant, coalesce(it ->> 'unidad', ''), v_uso,
          coalesce(it ->> 'unidad_uso', ''), to_char(v_precio, 'FM999999990.00'), coalesce(it ->> 'unidad', '')) end,
        nullif(concat_ws(' ', v_marca, v_modelo), ''),
        'Recibida por Delivery (' || v_quien || ')'),
      v_precio_uso);

    update public.productos set stock = v_despues, precio = v_precio_uso, precio_promedio = v_pp,
           marca = coalesce(v_marca, marca), modelo = coalesce(v_modelo, modelo)
     where id = v_pid;

    select e.stock into v_ex from public.existencias e where e.producto_id = v_pid and e.almacen = v_alm;
    insert into public.existencias (producto_id, almacen, stock, costo_promedio, updated_at)
    values (v_pid, v_alm, coalesce(v_ex, 0) + v_uso, v_pp, now())
    on conflict (producto_id, almacen) do update set stock = excluded.stock, costo_promedio = excluded.costo_promedio, updated_at = now();
  end loop;

  v_total := round(v_total, 2);
  v_saldado := coalesce(v_o.abonado_total, 0) >= coalesce(v_o.total, 0) - 0.01;
  v_estado := case when v_o.condiciones_pago = 'credito' and not v_saldado then 'cuenta_abierta' else 'recibida' end;

  update public.ordenes set
    estado = v_estado,
    items = v_items,
    recibido_total = v_total,
    nota_recepcion = 'Recibida por Delivery: ' || v_quien,
    recibida_por = p_actor_email,
    recibida_en = now(),
    historial = coalesce(historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', v_at, 'evento', 'recibida', 'actor', p_actor_email, 'actor_nombre', v_quien,
      'recibido_total', v_total, 'parcial', false, 'nota', 'Recibida por Delivery: ' || v_quien,
      'almacen_destino', v_o.almacen_destino, 'via', 'delivery',
      'motivo', 'Entregada por Delivery (' || v_quien || ') y recibida en Inventario'
        || case when v_afecta then '' else ' (sin mover stock: servicio / no afecta inventario)' end))
  where id = v_o.id;
  return 'recibida';
end $$;
revoke all on function public.delivery_recibir_oc(uuid, text, text) from public, anon, authenticated;
comment on function public.delivery_recibir_oc(uuid, text, text) is '02/11/2026: recepción completa de la OC cuando el delivery la marca entregada (misma regla que recibirOrdenParcial). Solo la llama delivery_avanzar.';


-- =====================================================================
-- 3) delivery_recepcion_3_listado_recibida_por_almacen
--    OC ya RECIBIDA por Compras/Almacén: al delivery ya no le sale. Una toma
--    viva de una OC que Almacén recibió se muestra CERRADA ('cancelado',
--    motivo «Recibida por Almacén») solo en la lista con cerrados.
-- =====================================================================
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
    -- toma viva de una OC que Almacén ya recibió por su cuenta → cerrada «Recibida por Almacén»
    cross join lateral (select (v.id is not null and v.estado in ('aceptado', 'en_ruta') and o.recibida_en is not null) as si) rec
    where coalesce(o.tipo, 'producto') = 'producto'
      and o.oc_codigo is not null
      and (
        (v_desde is not null and o.estado = 'pagada' and o.recibida_en is null and o.created_at >= v_desde
          and (v.id is null or v.estado = 'cancelado'))
        or (v.id is not null and v.estado in ('aceptado', 'en_ruta') and not rec.si)
        or (p_incluir_cerrados and v.id is not null and (v.estado in ('entregado', 'cancelado') or rec.si))
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


-- =====================================================================
-- 4) delivery_recepcion_4_avanzar_bloquea_recibida (versión final; la 2
--    era igual sin el bloqueo de la OC ya recibida por Almacén)
-- =====================================================================
create or replace function public.delivery_avanzar(
  p_pedido_id uuid, p_estado text, p_motivo text default null, p_detalle text default null,
  p_almacen text default null, p_nota text default null
) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_d public.delivery_pedidos; v_email text; v_ok boolean; v_oc text; v_prov text; v_rec text; v_nombre text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.repartidor_id <> auth.uid() and not public.delivery_puede('full') then
    raise exception 'Este pedido lo tiene %: solo él puede moverlo.', coalesce(v_d.repartidor_nombre, v_d.repartidor_email) using errcode = '42501';
  end if;
  if v_d.origen = 'compra' and v_d.estado in ('aceptado', 'en_ruta')
     and exists (select 1 from public.ordenes o where o.id = v_d.orden_id and o.recibida_en is not null) then
    raise exception 'Almacén ya recibió esta orden: el pedido quedó cerrado («Recibida por Almacén»).' using errcode = 'P0001';
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

  -- OC entregada → recibida en Inventario (idempotente: si ya estaba recibida no suma otra vez).
  -- El retiro de Almacén (origen almacen) NO toca stock: su salida la registra Almacén por Salidas.
  if p_estado = 'entregado' and v_d.origen = 'compra' then
    v_nombre := coalesce(v_d.repartidor_nombre, public.delivery_nombre_usuario(v_d.repartidor_email), v_email);
    begin
      v_rec := public.delivery_recibir_oc(v_d.orden_id, coalesce(v_d.repartidor_email, v_email), v_nombre);
    exception when others then
      v_rec := 'error: ' || sqlerrm;
    end;
    update public.delivery_pedidos
       set historial = historial || jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'recepcion_inventario',
             'actor', v_email, 'resultado', v_rec))
     where id = v_d.id returning * into v_d;
    if v_rec not in ('recibida', 'ya_recibida') then
      select coalesce(o.oc_codigo, o.codigo) into v_oc from public.ordenes o where o.id = v_d.orden_id;
      insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
      values ('almacenista', 'warning',
        '📥 OC ' || coalesce(v_oc, '') || ' entregada por Delivery: falta recibirla',
        coalesce(v_nombre, 'El delivery') || ' la entregó en ' || coalesce(v_d.almacen_entrega, 'el almacén')
          || ', pero no se pudo recibir sola en Inventario ('
          || case v_rec when 'requiere_despiece' then 'trae res en canal: hace falta el despiece'
                        when 'no_recibible' then 'la orden no está en un estado recibible'
                        else v_rec end
          || '). Recíbela desde Pedidos.',
        '#/app/pedidos', 'del-rec-' || v_d.orden_id::text);
    end if;
  end if;

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


-- =====================================================================
-- PRUEBAS (02/11/2026) — bloque DO que termina en raise exception (todo
-- revertido). A = asistentecomprasgt2 (NAZARET SALAZAR), L = almacenista.
-- Productos reales usados solo dentro de la transacción: AJO (HOR-003, stock
-- 6.90, pmp 6.9759) y CEBOLLA (HOR-001, stock 9.45, pmp 2.0773).
--   E1 OC-2026-9921 pagada (AJO 2 kg a 8; CEBOLLA 1 SACO de 10 KG a 20, marca
--      «prueba»; un renglón sin ficha a 5): A acepta y entrega → toma
--      entregado, resultado 'recibida'; orden 'recibida', recibido_total 41,
--      recibida_por = A, historial «Entregada por Delivery (NAZARET SALAZAR)
--      y recibida en Inventario»; cantidad_recibida 2,1,1.
--      AJO 8.90 / pmp 7.2060 / existencias General 8.90; CEBOLLA 19.45 /
--      pmp 2.0376 / existencias 19.45 / marca PRUEBA. 2 movimientos de
--      entrada en General: +2 @8.00 y +10 @2.00 («1 SACO = 10 KG (a 20.00
--      el SACO) · PRUEBA · Recibida por Delivery (NAZARET SALAZAR)»).        OK
--   E2 segunda recepción → 'ya_recibida', siguen 2 movimientos, AJO 8.90.     OK
--   E3 OC de SERVICIO → 'recibida', estado recibida, 0 movimientos.          OK
--   E4 A acepta OC-2026-9923; Almacén la recibe por su cuenta → teléfono 0
--      filas; con cerrados: cancelado «Recibida por Almacén»; entregar →
--      «Almacén ya recibió esta orden: el pedido quedó cerrado …».           OK
--   E5 OC pagada y ya recibida (contra entrega) → 0 en el listado; tomar →
--      «La orden OC-2026-9924 ya no está disponible para delivery».          OK
--   E6 retiro de Almacén (compuerta simulada abierta) entregado → 0
--      movimientos nuevos, la SP no queda recibida.                          OK
-- Después (base real): AJO 6.90, 0 órdenes de prueba, 0 filas en
-- delivery_pedidos, compuerta de Almacén en false.
-- =====================================================================
