begin;
do $recovery$
declare
 v_orden public.ordenes%rowtype;
 v_items jsonb;
 v_n int;
 v_total numeric;
 v_nota text := 'Recepción recuperada tras fallo al generar la reposición: se conservan las ocho entradas ya registradas; los cuatro renglones sin entrada quedan como faltantes.';
begin
 select * into v_orden from public.ordenes
 where id='dd288660-6ffd-48f3-9c5c-387fa8688c1f' and oc_codigo='OC-2026-0304'
 for update;
 if not found or v_orden.recibida_en is not null then return; end if;
 if coalesce(v_orden.historial,'[]'::jsonb) @> '[{"evento":"recepcion_reabierta"}]'::jsonb then return; end if;
 select count(*) into v_n from public.movimientos
 where ref_tipo='orden' and ref_id=v_orden.id::text and tipo='entrada';
 if v_n<>8 then raise exception 'La recepción cambió: se requiere volver a revisar los movimientos'; end if;
 if (select count(distinct i->>'productoId') from jsonb_array_elements(v_orden.items) i) <> jsonb_array_length(v_orden.items)
 then raise exception 'Hay productos repetidos: no se infieren cantidades'; end if;
 if exists(
  select 1 from jsonb_array_elements(v_orden.items) i
  join public.productos p on p.id::text=i->>'productoId' where coalesce(p.no_inventariable,false)
 ) then raise exception 'La orden incluye productos sin stock: no se infieren cantidades'; end if;
 select jsonb_agg(i || jsonb_build_object('cantidad_recibida',
   coalesce((select sum(m.delta) from public.movimientos m
     where m.ref_tipo='orden' and m.ref_id=v_orden.id::text and m.tipo='entrada'
       and m.producto_id::text=i->>'productoId'),0)
   / case when coalesce(nullif(i->>'factor','')::numeric,1)>0 then coalesce(nullif(i->>'factor','')::numeric,1) else 1 end
 )) into v_items from jsonb_array_elements(v_orden.items) i;
 if exists(select 1 from jsonb_array_elements(v_items) i
   where (i->>'cantidad_recibida')::numeric<0 or (i->>'cantidad_recibida')::numeric>(i->>'cantidad')::numeric)
 then raise exception 'Las entradas exceden lo pedido: no se finaliza automáticamente'; end if;
 if (select count(*) from jsonb_array_elements(v_items) i where (i->>'cantidad_recibida')::numeric>0)<>8
 or (select count(*) from jsonb_array_elements(v_items) i where (i->>'cantidad_recibida')::numeric=0)<>4
 then raise exception 'La distribución de faltantes cambió'; end if;
 select round(sum((i->>'cantidad_recibida')::numeric*(i->>'precio')::numeric),2) into v_total
 from jsonb_array_elements(v_items) i;
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text
 from public.usuarios where email='almacen.pzo.lospinos@gmail.com'),true);
 update public.ordenes set
   estado='recibida',items=v_items,recibido_total=v_total,
   recibida_en=now(),recibida_por='almacen.pzo.lospinos@gmail.com',nota_recepcion=v_nota,
   recepcion_en_curso_en=null,recepcion_en_curso_por=null,
   historial=coalesce(v_orden.historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
     'at',now(),'evento','recibida','actor','almacen.pzo.lospinos@gmail.com',
     'nota',v_nota,'parcial',true,'recibido_total',v_total,'almacen_destino','General','recuperacion_sql',true))
 where id=v_orden.id;
 if (select count(*) from public.movimientos where ref_tipo='orden' and ref_id=v_orden.id::text and tipo='entrada')<>8
 then raise exception 'La recuperación no debe generar entradas'; end if;
end $recovery$;
commit;
