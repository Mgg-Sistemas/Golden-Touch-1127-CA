begin;
create or replace function public.compras_excedentes_recepcion()
returns table(id uuid,codigo text,proveedor text,fecha timestamptz,nota text,items jsonb)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not (public.is_admin() or public.puede('compras') or exists(select 1 from usuarios u join roles_permisos rp on rp.role=u.role where u.id=auth.uid() and u.estado::text='activo' and coalesce((rp.permisos->'compras'->>'lectura')::boolean,false))) then raise exception 'Sin permiso de Compras'; end if;
 return query select o.id,coalesce(o.oc_codigo,o.codigo)::text,coalesce(p.razon_social,'Sin proveedor')::text,o.recibida_en,o.nota_recepcion::text,x.items
 from public.ordenes o left join public.proveedores p on p.id=o.proveedor_id
 cross join lateral(select jsonb_agg(i||jsonb_build_object('excedente',(i->>'cantidad_recibida')::numeric-(i->>'cantidad')::numeric)) items from jsonb_array_elements(o.items) i where (i->>'cantidad_recibida')::numeric>(i->>'cantidad')::numeric) x
 where o.recibida_en is not null and coalesce(o.tipo,'producto')='producto' and x.items is not null order by o.recibida_en desc,o.id;
end $$;
revoke all on function public.compras_excedentes_recepcion() from public;
grant execute on function public.compras_excedentes_recepcion() to authenticated;
notify pgrst,'reload schema';
commit;
