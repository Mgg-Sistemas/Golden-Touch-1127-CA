-- 06/11/2026 · Compras: «Pendientes por recibir» — el analista confirma el retiro antes del delivery.
--
-- Pedido de la administradora: al pagarse una OC ya NO va directo al delivery. Queda en la
-- tarjeta «Pendientes por recibir» del kanban de Compras; allí el analista confirma que se
-- retira y cómo (DELIVERY, CARGA PESADA o CON ENTREGA A DOMICILIO). Recién entonces le llega
-- el pedido al delivery / carga pesada (aviso + listado). Además, la trazabilidad de la orden
-- muestra lo que hizo el delivery: quién lo tomó, en ruta, entregado o cancelado.

-- 1) La confirmación del retiro
alter table public.ordenes add column if not exists retiro_confirmado_en timestamptz;
alter table public.ordenes add column if not exists retiro_confirmado_por text;
comment on column public.ordenes.retiro_confirmado_en is
  'Compras confirmó el retiro de la OC pagada (delivery / carga pesada / domicilio). Sin esto el delivery no la ve.';

-- Las que YA están con el delivery (tienen pedido vivo) quedan confirmadas; las demás pagadas
-- sin recibir pasan a «Pendientes por recibir».
update public.ordenes o
   set retiro_confirmado_en = coalesce(o.pagada_en, now()), retiro_confirmado_por = 'sistema'
 where o.retiro_confirmado_en is null
   and exists (select 1 from public.delivery_pedidos d
                where d.orden_id = o.id and d.origen = 'compra' and d.estado <> 'cancelado');

-- Al (re)pagarse, la OC vuelve a esperar la confirmación del retiro.
create or replace function public.ordenes_retiro_al_pagar()
 returns trigger language plpgsql set search_path to '' as $f$
begin
  if new.estado = 'pagada'::public.estado_orden and old.estado is distinct from new.estado then
    new.retiro_confirmado_en := null;
    new.retiro_confirmado_por := null;
  end if;
  return new;
end $f$;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ordenes_retiro_al_pagar' and tgrelid = 'public.ordenes'::regclass) then
    create trigger trg_ordenes_retiro_al_pagar before update of estado on public.ordenes
      for each row execute function public.ordenes_retiro_al_pagar();
  end if;
end $t$;

-- 2) Aviso al delivery: al CONFIRMAR el retiro (ya no al pagar)
create or replace function public.ordenes_a_delivery()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_desde timestamptz; v_prov text; v_dedup text; v_canal text;
begin
  begin
    if tg_op = 'UPDATE' and old.estado is not distinct from new.estado
       and old.retiro_confirmado_en is not distinct from new.retiro_confirmado_en then
      return null;
    end if;
    v_desde := public.delivery_desde();
    v_canal := public.delivery_canal_orden(new.modalidad_entrega);
    if v_desde is null
       or v_canal = 'proveedor'
       or new.estado is distinct from 'pagada'::public.estado_orden
       or new.retiro_confirmado_en is null
       or coalesce(new.tipo, 'producto') <> 'producto'
       or new.oc_codigo is null
       or new.recibida_en is not null
       or new.created_at < v_desde then
      return null;
    end if;
    v_dedup := 'del-disp-' || new.id::text || '-' || extract(epoch from new.retiro_confirmado_en)::bigint::text;
    if exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup)
       or exists (select 1 from public.delivery_pedidos d where d.orden_id = new.id and d.origen = 'compra' and d.estado <> 'cancelado') then
      return null;
    end if;
    select nullif(btrim(p.razon_social), '') into v_prov from public.proveedores p where p.id = new.proveedor_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values (v_canal, 'info',
      case when v_canal = 'carga_pesada' then '🚛 OC ' || new.oc_codigo || ' de carga pesada lista para buscar'
           else '🛵 OC ' || new.oc_codigo || ' lista para buscar' end,
      'OC ' || new.oc_codigo || ' pagada y confirmada por Compras' || coalesce(' · proveedor ' || v_prov, '')
        || case when coalesce(new.urgente, false) then ' · URGENTE' else '' end
        || case when v_canal = 'carga_pesada' then '. Tómala en Carga pesada.' else '. Tómala en Delivery.' end,
      case when v_canal = 'carga_pesada' then '#/app/carga-pesada/telefono' else '#/app/delivery/telefono' end, v_dedup);
  exception when others then
    raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm;
  end;
  return null;
end $function$;

-- 3) Listado del delivery y «tomar»: solo las de retiro confirmado
do $$
declare d text;
begin
  d := pg_get_functiondef('public.delivery_listado_canal(boolean, text)'::regprocedure);
  if position('o.retiro_confirmado_en is not null' in d) = 0 then
    d := replace(d,
      'o.estado = ''pagada'' and o.recibida_en is null and o.created_at >= v_desde',
      'o.estado = ''pagada'' and o.recibida_en is null and o.created_at >= v_desde and o.retiro_confirmado_en is not null');
    if position('o.retiro_confirmado_en is not null' in d) = 0 then
      raise exception 'delivery_listado_canal: no se encontró dónde filtrar el retiro confirmado';
    end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.delivery_no_disponible_por(public.ordenes, text, timestamptz)'::regprocedure);
  if position('retiro_confirmado_en' in d) = 0 then
    d := replace(d,
      '    v_canal := public.delivery_canal_orden(p_o.modalidad_entrega);',
      '    if p_o.retiro_confirmado_en is null then
      return format(''La orden %s todavía no tiene el retiro confirmado por Compras.'', coalesce(p_o.oc_codigo, p_o.codigo));
    end if;
    v_canal := public.delivery_canal_orden(p_o.modalidad_entrega);');
    if position('retiro_confirmado_en' in d) = 0 then
      raise exception 'delivery_no_disponible_por: no se encontró dónde validar el retiro confirmado';
    end if;
    execute d;
  end if;
end $$;

-- 4) Trazabilidad: lo que hace el delivery queda en el historial de la orden
create or replace function public.delivery_a_historial_orden()
 returns trigger language plpgsql security definer set search_path to '' as $f$
declare v_ev text;
begin
  if new.origen is distinct from 'compra' then return null; end if;
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then return null; end if;
  v_ev := case new.estado
    when 'aceptado' then 'delivery_tomado'
    when 'en_ruta' then 'delivery_en_ruta'
    when 'entregado' then 'delivery_entregado'
    when 'cancelado' then 'delivery_cancelado'
    else null end;
  if v_ev is null then return null; end if;
  update public.ordenes o
     set historial = coalesce(o.historial, '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
       'at', now(), 'evento', v_ev, 'actor', new.repartidor_email,
       'repartidor', new.repartidor_nombre,
       'canal', public.delivery_canal_orden(o.modalidad_entrega),
       'almacen', case when v_ev = 'delivery_entregado' then new.almacen_entrega end,
       'motivo', case when v_ev = 'delivery_cancelado' then new.motivo_cancel end)))
   where o.id = new.orden_id;
  return null;
exception when others then
  raise warning 'delivery_a_historial_orden(%): %', new.id, sqlerrm;
  return null;
end $f$;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_delivery_a_historial_orden' and tgrelid = 'public.delivery_pedidos'::regclass) then
    create trigger trg_delivery_a_historial_orden after insert or update of estado on public.delivery_pedidos
      for each row execute function public.delivery_a_historial_orden();
  end if;
end $t$;

-- Lo que ya pasó: quién tomó y entregó cada pedido de compra (una vez por evento).
update public.ordenes o
   set historial = coalesce(o.historial, '[]'::jsonb) || x.evs
  from (
    select d.orden_id, jsonb_agg(e.ev order by e.ev->>'at') as evs
      from public.delivery_pedidos d
      join public.ordenes oo on oo.id = d.orden_id
      cross join lateral (values
        (case when d.aceptado_en is not null then jsonb_strip_nulls(jsonb_build_object('at', d.aceptado_en, 'evento', 'delivery_tomado',
           'actor', d.repartidor_email, 'repartidor', d.repartidor_nombre, 'canal', public.delivery_canal_orden(oo.modalidad_entrega))) end),
        (case when d.entregado_en is not null then jsonb_strip_nulls(jsonb_build_object('at', d.entregado_en, 'evento', 'delivery_entregado',
           'actor', d.repartidor_email, 'repartidor', d.repartidor_nombre, 'canal', public.delivery_canal_orden(oo.modalidad_entrega),
           'almacen', d.almacen_entrega)) end)
      ) as e(ev)
     where d.origen = 'compra' and e.ev is not null
       and not exists (select 1 from jsonb_array_elements(coalesce(oo.historial, '[]'::jsonb)) h
                        where h->>'evento' like 'delivery_%')
     group by d.orden_id
  ) x
 where o.id = x.orden_id;
