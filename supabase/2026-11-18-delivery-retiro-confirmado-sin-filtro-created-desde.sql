-- 18/11/2026 · SP-2026-0370: una OC con retiro confirmado por Compras debe aparecer
-- en delivery/carga pesada aunque haya sido creada antes de activar el interruptor
-- (created_at < delivery_desde()). El auto-deploy NO ejecuta .sql: aplicar en Supabase.

-- 1) Aviso al confirmar retiro (antes exigía created_at >= v_desde).
create or replace function public.ordenes_a_delivery()
 returns trigger language plpgsql security definer set search_path to ''
as $f$
declare v_canal text; v_prov text; v_dedup text;
begin
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado
     and old.retiro_confirmado_en is not distinct from new.retiro_confirmado_en then return null; end if;
  if public.delivery_desde() is null then return null; end if;
  v_canal := public.delivery_canal_orden(new.modalidad_entrega);
  if v_canal = 'proveedor' or new.estado is distinct from 'pagada'::public.estado_orden
     or new.retiro_confirmado_en is null or coalesce(new.tipo,'producto') <> 'producto'
     or new.oc_codigo is null or new.recibida_en is not null then return null; end if;
  v_dedup := 'del-disp-' || new.id::text || '-' || extract(epoch from new.retiro_confirmado_en)::bigint::text;
  if exists (select 1 from public.notificaciones where dedup_key = v_dedup)
     or exists (select 1 from public.delivery_pedidos where orden_id = new.id and origen = 'compra' and estado <> 'cancelado') then return null; end if;
  select nullif(btrim(razon_social),'') into v_prov from public.proveedores where id = new.proveedor_id;
  insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
  values (v_canal, 'info',
    case when v_canal = 'carga_pesada' then 'OC ' || new.oc_codigo || ' de carga pesada lista para buscar' else 'OC ' || new.oc_codigo || ' lista para buscar' end,
    'OC ' || new.oc_codigo || ' pagada y confirmada por Compras' || coalesce(' - proveedor ' || v_prov, '')
      || case when coalesce(new.urgente,false) then ' - URGENTE' else '' end
      || case when v_canal = 'carga_pesada' then '. Tomala en Carga pesada.' else '. Tomala en Delivery.' end,
    case when v_canal = 'carga_pesada' then '#/app/carga-pesada/telefono' else '#/app/delivery/telefono' end, v_dedup);
  return null;
exception when others then raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm; return null;
end $f$;

-- 2) Parche quirúrgico: quitar SOLO el filtro created_at de las dos funciones de
--    listado/toma. No redefinimos delivery_listado_canal completo para no perder
--    columnas/funciones agregadas después (fotos de factura, etc.).
do $do$
declare d text; v_old text; v_new text;
begin
  d := pg_get_functiondef('public.delivery_listado_canal(boolean, text)'::regprocedure);
  v_old := 'o.estado = ''pagada'' and o.recibida_en is null and o.created_at >= v_desde and o.retiro_confirmado_en is not null';
  v_new := 'o.estado = ''pagada'' and o.recibida_en is null and o.retiro_confirmado_en is not null';
  if position(v_new in d) = 0 then
    if position(v_old in d) = 0 then raise exception 'No se encontró el filtro created_at en delivery_listado_canal'; end if;
    execute replace(d, v_old, v_new);
  end if;
  d := pg_get_functiondef('public.delivery_no_disponible_por(public.ordenes, text, timestamptz)'::regprocedure);
  v_old := ' or p_o.created_at < p_desde';
  if position(v_old in d) > 0 then d := replace(d, v_old, ''); execute d; end if;
end $do$;

-- 3) Verificación: las tres posiciones deben dar 0 (filtro ya no está).
select
  position('o.created_at >= v_desde and o.retiro_confirmado_en' in pg_get_functiondef('public.delivery_listado_canal(boolean, text)'::regprocedure)) as listado_filtro_fecha,
  position('p_o.created_at < p_desde' in pg_get_functiondef('public.delivery_no_disponible_por(public.ordenes, text, timestamptz)'::regprocedure)) as tomar_filtro_fecha,
  position('new.created_at < v_desde' in pg_get_functiondef('public.ordenes_a_delivery()'::regprocedure)) as aviso_filtro_fecha;
