begin;
do $repair$
declare
 o public.ordenes%rowtype;
 s public.ordenes%rowtype;
 pendientes jsonb;
 firma_caja text;
 entradas int;
begin
 select * into o from public.ordenes where id='dd288660-6ffd-48f3-9c5c-387fa8688c1f' and oc_codigo='OC-2026-0304' for update;
 if not found then return; end if;
 select * into s from public.ordenes where id='b98c49a7-d96d-47bb-b0b4-72a6e9a5d0f8' and codigo='SP-2026-0711' for update;
 if s.cotizacion_pendiente_origen_id=o.id and jsonb_array_length(o.items)=8 then return; end if;
 if s.id is null or s.estado::text<>'aprobada' or s.oc_codigo is not null
   or exists(select 1 from public.ofertas_proveedor where orden_id=s.id)
 then raise exception 'La solicitud cambió: revisa antes de reclasificar'; end if;
 if exists(select 1 from public.compras_reintegros where orden_id=o.id)
 then raise exception 'Hay un reintegro que debe revisarse antes de reclasificar'; end if;
 select count(*) into entradas from public.movimientos where ref_tipo='orden' and ref_id=o.id::text and tipo='entrada';
 if entradas<>8 then raise exception 'Las entradas de inventario cambiaron'; end if;
 select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'')) into firma_caja from public.movimientos_caja m where ref_orden_id=o.id;
 select jsonb_agg((i-'cantidad_recibida'-'marca_recibida'-'modelo_recibido'-'precio_usd'-'precio_eur'-'descuento')||
  jsonb_build_object('precio',0,'comprar',true,'cantidad_solicitada_original',(i->>'cantidad')::numeric,'cubierto_almacen',0,'cubierto_por_almacen',null))
 into pendientes from jsonb_array_elements(o.items) i where coalesce((i->>'precio')::numeric,0)=0;
 if jsonb_array_length(pendientes)<>4 then raise exception 'No coinciden los cuatro renglones sin precio'; end if;
 update public.ordenes set
  reposicion_origen_id=null,cotizacion_pendiente_origen_id=o.id,
  cotizacion_pendiente_clave=o.id::text||':'||md5(pendientes::text),
  items=pendientes,
  notas='Productos pendientes de cotizar de OC-2026-0304',
  motivo='Cuatro renglones excluidos antes del pago al quedar con precio cero.',
  historial=coalesce(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
   'at',now(),'evento','pendientes_cotizar','actor','sistema',
   'motivo','Corrección de clasificación: no fueron comprados en OC-2026-0304; quedan pendientes de cotizar.'))
 where id=s.id;
 update public.ordenes set items=items,
  nota_recepcion='Recibidos los ocho productos comprados en esta OC. Los cuatro renglones excluidos al quedar con precio cero están pendientes de cotizar en SP-2026-0711.',
  historial=coalesce(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
   'at',now(),'evento','no_cotizados_separados','actor','sistema',
   'motivo','Cuatro renglones sin precio separados de la OC y visibles en Pendientes de cotizar (SP-2026-0711).'))
 where id=o.id;
 if (select jsonb_array_length(items) from public.ordenes where id=o.id)<>8
   or (select jsonb_array_length(items_no_cotizados) from public.ordenes where id=o.id)<>4
   or (select count(*) from public.ordenes where cotizacion_pendiente_origen_id=o.id)<>1
 then raise exception 'La separación no coincide con lo esperado'; end if;
 if (select count(*) from public.movimientos where ref_tipo='orden' and ref_id=o.id::text and tipo='entrada')<>entradas
 then raise exception 'La corrección no debe modificar el inventario'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'')) from public.movimientos_caja m where ref_orden_id=o.id) is distinct from firma_caja
 then raise exception 'La corrección no debe modificar los pagos'; end if;
 if (select total from public.ordenes where id=o.id)<>o.total then raise exception 'El monto pagado debe conservarse'; end if;
end $repair$;
commit;
