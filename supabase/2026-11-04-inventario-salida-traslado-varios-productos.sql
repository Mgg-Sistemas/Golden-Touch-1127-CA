-- ============================================================
-- Golden Touch · Inventario (teléfono) · Varios productos en una sola
-- salida o en un solo traslado (04/11/2026)
--
-- Envoltorios en lote de las funciones que ya existen, en UNA transacción:
-- si un renglón falla (no alcanza el stock, sin permiso…), no se guarda
-- ninguno. Cada renglón conserva su propio N° (SDM-/SIG-…, TRA-####), así el
-- histórico, el kardex y «Por retornar» siguen igual que con un producto.
--
--   deposito_mina_registrar_salidas(p jsonb)  → setof deposito_mina_salidas
--     p = { almacen, motivo, autorizado_por, retorna, actor, actor_name,
--           items: [{ producto_id, cantidad }, …] }
--   inventario_trasladar_deposito_lote(p jsonb) → jsonb (array de traslados)
--     p = { destino, nota, actor, actor_name, items: [{ producto_id, cantidad }, …] }
--
-- SECURITY INVOKER (como las originales): el RLS y los permisos por depósito
-- se aplican igual que hoy.
-- ============================================================

create or replace function public.deposito_mina_registrar_salidas(p jsonb)
returns setof public.deposito_mina_salidas
language plpgsql
set search_path = public
as $$
declare
  it jsonb;
begin
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'La salida no tiene productos.';
  end if;
  if jsonb_array_length(p->'items') > 30 then
    raise exception 'Máximo 30 productos por salida.';
  end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    return next public.deposito_mina_registrar_salida(
      (p - 'items') || jsonb_build_object('producto_id', it->>'producto_id', 'cantidad', (it->>'cantidad')::numeric)
    );
  end loop;
end;
$$;

create or replace function public.inventario_trasladar_deposito_lote(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  it jsonb;
  res jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'El traslado no tiene productos.';
  end if;
  if jsonb_array_length(p->'items') > 30 then
    raise exception 'Máximo 30 productos por traslado.';
  end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    res := res || jsonb_build_array(public.inventario_trasladar_deposito(
      (p - 'items') || jsonb_build_object('producto_id', it->>'producto_id', 'cantidad', (it->>'cantidad')::numeric)
    ));
  end loop;
  return res;
end;
$$;

revoke execute on function public.deposito_mina_registrar_salidas(jsonb) from anon;
revoke execute on function public.inventario_trasladar_deposito_lote(jsonb) from anon;
grant execute on function public.deposito_mina_registrar_salidas(jsonb) to authenticated;
grant execute on function public.inventario_trasladar_deposito_lote(jsonb) to authenticated;
