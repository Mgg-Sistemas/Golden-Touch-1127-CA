-- ============================================================
-- Golden Touch · Compras / Delivery · Sede de entrega (04/11/2026)
-- Al hacer la solicitud de pedido se elige dónde se entrega (Los Pinos o Matanza);
-- solo para el delivery: le sale «Entregar en la sede: …». delivery_listado no se
-- toca (cambiar su tabla de retorno exige DROP): la app pide la sede aparte.
-- ============================================================
alter table public.ordenes add column if not exists sede_entrega text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_sede_entrega_chk') then
    alter table public.ordenes add constraint ordenes_sede_entrega_chk check (sede_entrega is null or sede_entrega in ('los_pinos', 'matanza'));
  end if;
end $$;

create or replace function public.delivery_sedes_entrega(p_orden_ids uuid[])
returns table(orden_id uuid, sede_entrega text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.delivery_puede('lectura') then
    raise exception 'No tienes permiso en Delivery.' using errcode = '42501';
  end if;
  return query select o.id, o.sede_entrega from public.ordenes o where o.id = any(p_orden_ids);
end $$;
revoke execute on function public.delivery_sedes_entrega(uuid[]) from anon;
grant execute on function public.delivery_sedes_entrega(uuid[]) to authenticated;
