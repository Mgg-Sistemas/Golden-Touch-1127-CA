begin;
-- Reprocesar OC históricas pendientes: los disparadores conservan los no cotizados y crean su solicitud vinculada.
update public.ordenes o set items=o.items
where coalesce(o.tipo,'producto')='producto' and o.oc_codigo is not null and o.recibida_en is null
 and o.estado::text in ('oc_creada','confirmada_metodo','oc_aprobada','pagada','por_recibir','cuenta_abierta')
 and not exists(select 1 from public.movimientos m where m.ref_tipo='orden' and m.ref_id=o.id::text and m.tipo='entrada')
 and exists(select 1 from jsonb_array_elements(o.items) i where coalesce(i->>'comprar','true')<>'false' and (i->>'cantidad')::numeric>0 and (case when coalesce(o.pago_en_divisa,false) and nullif(i->>'precio_usd','') is not null then (i->>'precio_usd')::numeric else coalesce((i->>'precio')::numeric,0) end)<=0)
 and exists(select 1 from jsonb_array_elements(o.items) i where coalesce(i->>'comprar','true')<>'false' and (i->>'cantidad')::numeric>0 and (case when coalesce(o.pago_en_divisa,false) and nullif(i->>'precio_usd','') is not null then (i->>'precio_usd')::numeric else coalesce((i->>'precio')::numeric,0) end)>0);
commit;
