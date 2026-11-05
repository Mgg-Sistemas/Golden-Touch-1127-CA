-- ============================================================================
-- 05/11/2026 · Delivery / Carga pesada (como MGG): el mapa ve solo su flota
--
-- Cada ubicación en vivo queda marcada con su flota. Si va con un pedido, la
-- flota sale de la OC (modalidad_entrega); si no, del rol del repartidor
-- (solo Carga pesada → carga_pesada; el resto → delivery).
-- ============================================================================

alter table public.delivery_ubicaciones add column if not exists flota text not null default 'delivery';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_ubicaciones_flota_chk') then
    alter table public.delivery_ubicaciones add constraint delivery_ubicaciones_flota_chk check (flota in ('delivery', 'carga_pesada'));
  end if;
end $$;

create or replace function public.delivery_ubicacion_flota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mod text; v_cp boolean; v_dl boolean;
begin
  if new.pedido_id is not null then
    select o.modalidad_entrega into v_mod
      from public.delivery_pedidos d join public.ordenes o on o.id = d.orden_id
     where d.id = new.pedido_id and d.origen = 'compra';
  end if;
  if v_mod = 'carga_pesada' then
    new.flota := 'carga_pesada';
  elsif new.pedido_id is not null and found then
    new.flota := 'delivery';
  else
    select coalesce((rp.permisos -> 'carga_pesada' ->> 'lectura')::boolean, false),
           coalesce((rp.permisos -> 'delivery' ->> 'lectura')::boolean, false)
      into v_cp, v_dl
      from public.usuarios u join public.roles_permisos rp on rp.role = u.role
     where u.id = new.repartidor_id;
    new.flota := case when coalesce(v_cp, false) and not coalesce(v_dl, false) then 'carga_pesada' else 'delivery' end;
  end if;
  return new;
end $$;

create trigger delivery_ubicacion_flota before insert or update on public.delivery_ubicaciones
  for each row execute function public.delivery_ubicacion_flota();

-- Las que ya están: por el rol del repartidor.
update public.delivery_ubicaciones u set flota = 'carga_pesada'
  from public.usuarios us join public.roles_permisos rp on rp.role = us.role
 where us.id = u.repartidor_id
   and coalesce((rp.permisos -> 'carga_pesada' ->> 'lectura')::boolean, false)
   and not coalesce((rp.permisos -> 'delivery' ->> 'lectura')::boolean, false);
