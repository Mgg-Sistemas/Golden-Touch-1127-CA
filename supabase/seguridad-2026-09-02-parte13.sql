-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 13
-- GT-INT-12 · La importación de Excel mueve stock sin pasar por el kardex
--
-- QUÉ PASA
-- `aplicarImportacion` escribe `existencias` con un upsert directo:
--     supabase.from('existencias').upsert(exRows, ...)
-- Sin movimiento. Todo el resto del sistema —entradas, salidas, consumos,
-- traslados, producción— pasa por `registrar_movimiento_stock`, que deja la
-- fila en el kardex y recalcula el costo promedio. La importación no.
--
-- Resultado: un producto pasa de 60 a 500 y en el kardex no hay nada que lo
-- explique. Cualquier reporte que reconstruya la existencia sumando movimientos
-- deja de cuadrar con la existencia real, y no hay forma de saber quién la
-- cambió ni cuándo. Además el upsert pisa `costo_promedio` con el precio de la
-- planilla, borrando el promedio ponderado que venía de las compras.
--
-- QUÉ CAMBIA
-- Una función que recibe la lista de la importación y, por cada producto,
-- calcula la DIFERENCIA contra lo que hay y la registra como un movimiento de
-- `ajuste` con `ref_tipo = 'importacion'`. Reusa `registrar_movimiento_stock`,
-- así que la importación queda igual que cualquier otra operación: kardex,
-- existencia y costo promedio se mueven juntos y por el mismo camino.
--
-- Los productos cuyo stock NO cambia no generan movimiento: una importación que
-- solo corrige nombres o categorías no ensucia el kardex.
--
-- Devuelve cuántos movimientos hizo y los errores por producto, para que la
-- pantalla los muestre en el resumen de la importación en vez de perderlos.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.importar_ajuste_stock(
  p_items jsonb,                      -- [{producto_id, stock, precio}]
  p_actor text,
  p_actor_name text default null
)
returns jsonb
language plpgsql
as $fn$
declare
  it            jsonb;
  v_producto    uuid;
  v_objetivo    numeric;
  v_precio      numeric;
  v_actual      numeric;
  v_delta       numeric;
  v_movs        int := 0;
  v_sin_cambio  int := 0;
  v_errores     jsonb := '[]'::jsonb;
  v_nombre      text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Se esperaba una lista de productos.';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_producto := nullif(it->>'producto_id','')::uuid;
    v_objetivo := coalesce((it->>'stock')::numeric, 0);
    v_precio   := nullif(it->>'precio','')::numeric;
    if v_producto is null then continue; end if;

    select coalesce(stock, 0) into v_actual
      from public.existencias
     where producto_id = v_producto and almacen = 'General';
    v_actual := coalesce(v_actual, 0);
    v_delta  := v_objetivo - v_actual;

    if v_delta = 0 then
      v_sin_cambio := v_sin_cambio + 1;
      continue;
    end if;

    begin
      perform public.registrar_movimiento_stock(jsonb_build_object(
        'producto_id',     v_producto,
        'tipo',            'ajuste',
        'delta',           v_delta,
        'actor',           p_actor,
        'actor_name',      p_actor_name,
        'ref_tipo',        'importacion',
        'detalle',         'Importación de inventario · ajuste de ' ||
                           trim(to_char(v_actual,   'FM999999990.####')) || ' a ' ||
                           trim(to_char(v_objetivo, 'FM999999990.####')),
        -- El precio solo pondera cuando ENTRA mercadería, igual que en una compra.
        'precio_unitario', case when v_delta > 0 then v_precio else null end
      ));
      v_movs := v_movs + 1;
    exception when others then
      select nombre into v_nombre from public.productos where id = v_producto;
      v_errores := v_errores || jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto,
        'nombre',      coalesce(v_nombre, '(sin nombre)'),
        'motivo',      sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'movimientos', v_movs,
    'sin_cambio',  v_sin_cambio,
    'errores',     v_errores);
end $fn$;

revoke execute on function public.importar_ajuste_stock(jsonb, text, text) from public, anon;
grant  execute on function public.importar_ajuste_stock(jsonb, text, text) to authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'importar_ajuste_stock';
