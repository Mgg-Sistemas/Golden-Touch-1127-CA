begin;
create or replace function public.compras_pagos_detalle_reintegro(p_orden uuid)
returns table(fecha timestamptz,monto numeric,moneda text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not (public.is_admin() or public.puede('compras') or public.puede('tesoreria') or exists(select 1 from public.usuarios u join public.roles_permisos rp on rp.role=u.role where u.id=auth.uid() and u.estado::text='activo' and not coalesce(u.must_change_password,false) and (coalesce((rp.permisos->'compras'->>'lectura')::boolean,false) or coalesce((rp.permisos->'tesoreria'->>'lectura')::boolean,false)))) then raise exception 'Sin permiso para consultar el pago'; end if;
 return query select m.at,m.monto::numeric,m.moneda::text from public.movimientos_caja m
 where m.ref_orden_id=p_orden and m.tipo::text='salida' and m.categoria in ('pago_oc','reembolso_oc')
 and m.revertido_en is null and m.reverso_de_id is null
 and not exists(select 1 from public.movimientos_caja r where r.reverso_de_id=m.id)
 order by m.at desc,m.id;
end $$;
revoke all on function public.compras_pagos_detalle_reintegro(uuid) from public;
grant execute on function public.compras_pagos_detalle_reintegro(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
