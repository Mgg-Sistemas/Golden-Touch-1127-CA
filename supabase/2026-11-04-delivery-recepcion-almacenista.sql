-- ============================================================
-- Golden Touch · Delivery → el almacenista RECEPCIONA desde el teléfono (04/11/2026)
--
-- Antes: al marcar «Entregado», delivery_avanzar recibía la OC sola en Inventario.
-- Ahora: «Entregado» deja el pedido POR RECEPCIONAR y avisa al almacenista. Él, desde
-- Inventario en el teléfono («📥 Recepción»), ve la OC, el proveedor, el solicitante,
-- el delivery y sus fotos, ajusta lo que llegó de cada renglón y toca «✅ Recepcionar»:
-- delivery_recepcionar suma al inventario (delivery_recibir_oc_cant, misma regla que la
-- recepción de la PC), marca la OC recibida en Compras y deja la recepción anotada.
-- Si la OC ya se recibió por la PC, el pedido sale de la lista solo.
-- ============================================================

alter table public.delivery_pedidos add column if not exists recepcionado_en timestamptz;
alter table public.delivery_pedidos add column if not exists recepcionado_por text;
alter table public.delivery_pedidos add column if not exists recepcionado_nombre text;
alter table public.delivery_pedidos add column if not exists recepcion_nota text;
alter table public.delivery_pedidos add column if not exists recepcion_parcial boolean not null default false;

-- ---------- Recepción con la cantidad que llegó de cada renglón ----------
create or replace function public.delivery_recibir_oc_cant(
  p_orden_id uuid, p_actor_email text, p_actor_nombre text, p_cants jsonb default null, p_via text default 'delivery'
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_o public.ordenes;
  v_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_afecta boolean;
  it jsonb;
  v_idx bigint;
  v_items jsonb := '[]'::jsonb;
  v_pid uuid; v_pedida numeric; v_cant numeric; v_factor numeric; v_uso numeric; v_precio numeric; v_precio_uso numeric;
  v_prod record; v_antes numeric; v_despues numeric; v_pp numeric; v_actual numeric; v_alm text;
  v_ex numeric; v_total numeric := 0; v_estado public.estado_orden; v_saldado boolean; v_parcial boolean := false;
  v_quien text := coalesce(nullif(btrim(p_actor_nombre), ''), p_actor_email, 'Almacén');
  v_marca text; v_modelo text; v_nota text;
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
  v_nota := case when p_via = 'almacen_telefono' then 'Recepcionada en almacén (teléfono) por ' || v_quien
                 else 'Recibida por Delivery: ' || v_quien end;

  for it, v_idx in select x, n from jsonb_array_elements(coalesce(v_o.items, '[]'::jsonb)) with ordinality as t(x, n) loop
    v_pedida := greatest(coalesce(nullif(it ->> 'cantidad', '')::numeric, 0), 0);
    v_cant := v_pedida;
    if p_cants is not null and jsonb_typeof(p_cants) = 'array' and jsonb_array_length(p_cants) >= v_idx
       and nullif(p_cants ->> (v_idx - 1)::int, '') is not null then
      v_cant := least(greatest((p_cants ->> (v_idx - 1)::int)::numeric, 0), v_pedida);
    end if;
    if v_cant < v_pedida then v_parcial := true; end if;
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
        format('Recepción de %s/%s %s @ %s (promedio: %s) → %s', v_cant, v_pedida, coalesce(it ->> 'sku', ''),
          to_char(v_precio_uso, 'FM999999990.00'), to_char(v_pp, 'FM999999990.00'), v_alm),
        case when v_factor <> 1 then format('%s %s = %s %s (a %s el %s)', v_cant, coalesce(it ->> 'unidad', ''), v_uso,
          coalesce(it ->> 'unidad_uso', ''), to_char(v_precio, 'FM999999990.00'), coalesce(it ->> 'unidad', '')) end,
        nullif(concat_ws(' ', v_marca, v_modelo), ''),
        v_nota),
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
    nota_recepcion = v_nota,
    recibida_por = p_actor_email,
    recibida_en = now(),
    historial = coalesce(historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', v_at, 'evento', 'recibida', 'actor', p_actor_email, 'actor_nombre', v_quien,
      'recibido_total', v_total, 'parcial', v_parcial, 'nota', v_nota,
      'almacen_destino', v_o.almacen_destino, 'via', p_via,
      'motivo', v_nota || case when v_afecta then '' else ' (sin mover stock: servicio / no afecta inventario)' end))
  where id = v_o.id;
  return case when v_parcial then 'recibida_parcial' else 'recibida' end;
end $function$;

revoke all on function public.delivery_recibir_oc_cant(uuid, text, text, jsonb, text) from public, anon, authenticated;

-- El de siempre (3 argumentos) sigue existiendo y usa el nuevo, con todo lo pedido.
create or replace function public.delivery_recibir_oc(p_orden_id uuid, p_actor_email text, p_actor_nombre text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v text;
begin
  v := public.delivery_recibir_oc_cant(p_orden_id, p_actor_email, p_actor_nombre, null, 'delivery');
  return case when v = 'recibida_parcial' then 'recibida' else v end;
end $function$;
revoke all on function public.delivery_recibir_oc(uuid, text, text) from public, anon, authenticated;

-- ---------- «Entregado» ya no recibe sola: queda por recepcionar y avisa al almacenista ----------
create or replace function public.delivery_avanzar(p_pedido_id uuid, p_estado text, p_motivo text default null::text, p_detalle text default null::text, p_almacen text default null::text, p_nota text default null::text)
 returns delivery_pedidos
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_d public.delivery_pedidos; v_email text; v_ok boolean; v_oc text; v_prov text; v_nombre text;
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

  -- 04/11/2026: la OC entregada queda POR RECEPCIONAR; el almacenista la recibe desde su
  -- teléfono (delivery_recepcionar). Aviso al rol almacenista.
  if p_estado = 'entregado' and v_d.origen = 'compra' then
    v_nombre := coalesce(v_d.repartidor_nombre, public.delivery_nombre_usuario(v_d.repartidor_email), v_email);
    select coalesce(o.oc_codigo, o.codigo), nullif(btrim(p.razon_social), '') into v_oc, v_prov
      from public.ordenes o left join public.proveedores p on p.id = o.proveedor_id where o.id = v_d.orden_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('almacenista', 'warning',
      '📥 OC ' || coalesce(v_oc, '') || ' entregada por Delivery: recepciónala',
      coalesce(v_nombre, 'El delivery') || ' la entregó en ' || coalesce(v_d.almacen_entrega, 'el almacén')
        || coalesce(' · proveedor ' || v_prov, '') || '. Recepciónala desde Inventario en el teléfono («📥 Recepción»).',
      '#/app/inventario/telefono', 'del-rec-' || v_d.orden_id::text);
  end if;

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
end $function$;

-- ---------- Lo que el almacenista tiene por recepcionar ----------
create or replace function public.delivery_por_recepcionar()
returns jsonb
language plpgsql
stable
security definer
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
      'fotos_recibo', d.fotos_recibo, 'fotos_entrega', d.fotos_entrega,
      'items', o.items, 'total', o.total, 'almacen_destino', o.almacen_destino, 'urgente', o.urgente
    ) order by d.entregado_en)
    from public.delivery_pedidos d
    join public.ordenes o on o.id = d.orden_id
    left join public.proveedores p on p.id = o.proveedor_id
    where d.origen = 'compra' and d.estado = 'entregado' and d.recepcionado_en is null and o.recibida_en is null
  ), '[]'::jsonb);
end $function$;
revoke execute on function public.delivery_por_recepcionar() from anon;
grant execute on function public.delivery_por_recepcionar() to authenticated;

-- ---------- Recepcionar ----------
create or replace function public.delivery_recepcionar(p_pedido_id uuid, p_cants jsonb default null, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_d public.delivery_pedidos;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_nombre text;
  v_rec text;
  v_oc text;
begin
  if not (public.is_admin() or public.puede('inventario')) then
    raise exception 'No tienes permiso de escritura en Inventario.' using errcode = '42501';
  end if;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.origen <> 'compra' or v_d.estado <> 'entregado' then
    raise exception 'Ese pedido no está entregado en almacén.' using errcode = 'P0001';
  end if;
  if v_d.recepcionado_en is not null then
    raise exception 'Ese pedido ya lo recepcionó %.', coalesce(v_d.recepcionado_nombre, v_d.recepcionado_por) using errcode = 'P0001';
  end if;
  v_nombre := public.delivery_nombre_usuario(v_email);

  v_rec := public.delivery_recibir_oc_cant(v_d.orden_id, v_email, v_nombre, p_cants, 'almacen_telefono');
  if v_rec not in ('recibida', 'recibida_parcial', 'ya_recibida') then
    raise exception '%', case v_rec
      when 'requiere_despiece' then 'Esta OC trae res en canal: recíbela por la PC con el despiece.'
      when 'no_recibible' then 'La orden no está en un estado que se pueda recibir.'
      when 'no_existe' then 'No se encontró la orden.'
      else v_rec end using errcode = 'P0001';
  end if;

  update public.delivery_pedidos set
    recepcionado_en = now(), recepcionado_por = v_email, recepcionado_nombre = v_nombre,
    recepcion_nota = nullif(btrim(coalesce(p_nota, '')), ''), recepcion_parcial = (v_rec = 'recibida_parcial'),
    historial = historial || jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'recepcionado', 'actor', v_email,
      'resultado', v_rec, 'nota', nullif(btrim(coalesce(p_nota, '')), ''))),
    updated_at = now()
  where id = v_d.id;

  select coalesce(o.oc_codigo, o.codigo) into v_oc from public.ordenes o where o.id = v_d.orden_id;
  insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
  values ('analista_de_compras', 'success',
    '📥 OC ' || coalesce(v_oc, '') || ' recepcionada en almacén',
    coalesce(v_nombre, 'El almacenista') || ' la recepcionó' || case when v_rec = 'recibida_parcial' then ' (llegó incompleta)' else '' end
      || '. Ya está en Inventario y marcada recibida en Compras.',
    '#/app/pedidos', 'del-recep-' || v_d.orden_id::text);

  return jsonb_build_object('resultado', v_rec, 'pedido_id', v_d.id, 'orden_id', v_d.orden_id,
    'recepcionado_por', v_email, 'recepcionado_nombre', v_nombre, 'at', now());
end $function$;
revoke execute on function public.delivery_recepcionar(uuid, jsonb, text) from anon;
grant execute on function public.delivery_recepcionar(uuid, jsonb, text) to authenticated;
