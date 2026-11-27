begin;
do $reopen$
declare
 o public.ordenes%rowtype; m public.movimientos%rowtype; r public.movimientos%rowtype;
 p public.productos%rowtype; e public.existencias%rowtype;
 n int:=0; firma_caja text; v_motivo text:='Reapertura de OC-2026-0304 por solicitud del usuario para verificar nuevamente la recepción.';
begin
 select * into o from public.ordenes where id='dd288660-6ffd-48f3-9c5c-387fa8688c1f' and oc_codigo='OC-2026-0304' for update;
 if not found then return; end if;
 if o.estado::text='por_recibir' and o.recibida_en is null then return; end if;
 if o.estado::text<>'recibida' then raise exception 'La orden cambió de estado: revisar antes de reabrir'; end if;
 if jsonb_array_length(o.items)<>8 then raise exception 'Se esperaban los ocho productos comprados'; end if;
 if (select count(*) from public.movimientos where tipo='entrada' and ref_tipo='orden' and ref_id=o.id::text and revertido_en is null)<>8
 then raise exception 'Las entradas de la recepción cambiaron'; end if;
 select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) into firma_caja
 from public.movimientos_caja c where ref_orden_id=o.id;
 for m in select * from public.movimientos where tipo='entrada' and ref_tipo='orden' and ref_id=o.id::text and revertido_en is null order by producto_id for update loop
  select * into p from public.productos where id=m.producto_id for update;
  select * into e from public.existencias where producto_id=m.producto_id and almacen=m.almacen for update;
  if p.stock is distinct from m.delta or e.stock is distinct from m.delta
    or m.stock_antes<>0 or m.stock_despues<>m.delta
    or coalesce(nullif(p.almacen,''),'General')<>m.almacen
  then raise exception 'El stock de % cambió desde la recepción',p.nombre; end if;
  if exists(select 1 from public.movimientos otro where otro.producto_id=m.producto_id and otro.id<>m.id and otro.at>m.at)
    or exists(select 1 from public.existencias otro where otro.producto_id=m.producto_id and otro.almacen<>m.almacen and otro.stock<>0)
  then raise exception 'Hay movimientos posteriores de %; no se revierte automáticamente',p.nombre; end if;
  r:=public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id',m.producto_id,'tipo','salida','delta',-m.delta,'almacen',m.almacen,
    'actor','sistema','actor_name','Reapertura de recepción',
    'ref_tipo','reverso_recepcion','ref_id',m.id::text,'ref_codigo',o.oc_codigo,
    'detalle',v_motivo,'at',clock_timestamp()));
  update public.movimientos set reverso_de_id=m.id where id=r.id;
  update public.movimientos set revertido_en=now() where id=m.id;
  n:=n+1;
 end loop;
 if n<>8 then raise exception 'No se revirtieron las ocho entradas'; end if;
 update public.ordenes set
   estado='por_recibir',recibida_en=null,recibida_por=null,recibido_total=null,nota_recepcion=null,
   recepcion_en_curso_en=null,recepcion_en_curso_por=null,
   items=(select jsonb_agg(i-'cantidad_recibida'-'marca_recibida'-'modelo_recibido') from jsonb_array_elements(o.items) i),
   historial=coalesce(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
     'at',now(),'evento','recepcion_reabierta','actor','sistema','motivo',v_motivo,'entradas_revertidas',n))
 where id=o.id;
 if exists(select 1 from public.productos pr join public.movimientos mv on mv.producto_id=pr.id where mv.ref_tipo='orden' and mv.ref_id=o.id::text and pr.stock<>0)
 then raise exception 'El stock debe quedar pendiente de la nueva confirmación'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) from public.movimientos_caja c where ref_orden_id=o.id) is distinct from firma_caja
 then raise exception 'La reapertura no debe modificar los pagos'; end if;
end $reopen$;
commit;
