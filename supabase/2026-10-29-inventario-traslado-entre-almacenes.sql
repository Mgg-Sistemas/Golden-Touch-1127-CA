-- ============================================================
-- 29/10/2026 · Traslado entre almacenes (Inventario General ↔ Depósito Mina)
-- Vista de teléfono de Inventario y de Depósito Mina, botón «Traslado entre almacenes».
--
-- Los dos depósitos tienen catálogo propio: un producto es de UNO solo
-- (trg_productos_deposito_fijo) y registrar_movimiento_stock siempre mueve el
-- almacén del producto. Por eso trasladar = sacar del producto en el origen y
-- meter en su GEMELO del otro depósito (mismo nombre, sin acentos ni mayúsculas).
-- Si el gemelo no existe se crea (misma categoría, unidad y precio; SKU nuevo de
-- su categoría). Todo en UNA transacción: o pasan las dos patas o ninguna.
-- El costo viaja: la entrada en destino lleva el costo promedio del origen.
-- Permisos: SECURITY INVOKER → el RLS de productos/movimientos/existencias
-- (puede_inventario) decide quién puede.
-- ============================================================
create or replace function public.inventario_trasladar_deposito(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_src      public.productos;
  v_dst      public.productos;
  v_cant     numeric := round(coalesce(nullif(p->>'cantidad', '')::numeric, 0), 4);
  v_nota     text := nullif(btrim(coalesce(p->>'nota', '')), '');
  v_actor    text := coalesce(nullif(auth.jwt()->>'email', ''), p->>'actor', 'sistema');
  v_nombre_a text := nullif(btrim(coalesce(p->>'actor_name', '')), '');
  v_origen   text;
  v_destino  text;
  v_codigo   text;
  v_creado   boolean := false;
  v_pre      text;
  v_sku      text;
  v_costo    numeric;
  v_stock    numeric;
  v_m1       public.movimientos;
  v_m2       public.movimientos;
begin
  select * into v_src from public.productos where id = nullif(p->>'producto_id', '')::uuid for update;
  if v_src.id is null then raise exception 'No se encontró el producto.' using errcode = '23503'; end if;
  if v_src.estado <> 'activo' then raise exception 'El producto % está inactivo.', v_src.nombre using errcode = '23514'; end if;
  if v_cant <= 0 then raise exception 'Escribe cuánto se traslada.' using errcode = '23514'; end if;

  v_origen  := case when v_src.almacen = 'Depósito Mina' then 'Depósito Mina' else 'General' end;
  v_destino := case when v_origen = 'Depósito Mina' then 'General' else 'Depósito Mina' end;

  select coalesce(stock, 0), coalesce(costo_promedio, 0) into v_stock, v_costo
    from public.existencias where producto_id = v_src.id and almacen = v_origen for update;
  v_stock := coalesce(v_stock, 0);
  if v_cant > v_stock then
    raise exception 'No alcanza: en % hay % % de %.', v_origen, trim(to_char(v_stock, 'FM999999990.####')), v_src.unidad, v_src.nombre
      using errcode = 'check_violation';
  end if;
  if coalesce(v_costo, 0) <= 0 then v_costo := greatest(coalesce(v_src.precio, 0), 0); end if;

  -- El gemelo del otro depósito (la base ya garantiza un solo activo por nombre y depósito).
  select * into v_dst from public.productos
   where estado = 'activo'
     and (case when almacen = 'Depósito Mina' then 'Depósito Mina' else 'General' end) = v_destino
     and lower(public.sin_acentos(btrim(nombre))) = lower(public.sin_acentos(btrim(v_src.nombre)))
   limit 1 for update;

  if v_dst.id is not null and upper(btrim(coalesce(v_dst.unidad, ''))) <> upper(btrim(coalesce(v_src.unidad, ''))) then
    raise exception 'En % «%» está en «%» y aquí en «%»: corrige la unidad antes de trasladar.',
      v_destino, v_dst.nombre, v_dst.unidad, v_src.unidad using errcode = '23514';
  end if;

  if v_dst.id is null then
    v_pre := public._prefijo_categoria_interno(v_src.categoria);
    v_sku := v_pre || '-' || lpad(public.next_sku(v_pre, 1)::text, 3, '0');
    insert into public.productos (sku, nombre, categoria, unidad, stock, stock_min, precio, almacen, estado)
    values (v_sku, v_src.nombre, v_src.categoria, v_src.unidad, 0, 0, coalesce(v_src.precio, 0), v_destino, 'activo')
    returning * into v_dst;
    v_creado := true;
  end if;

  v_codigo := 'TRA-' || lpad(public.next_correlativo('traslado-almacen')::text, 4, '0');

  v_m1 := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_src.id, 'tipo', 'transferencia', 'delta', -v_cant,
    'actor', v_actor, 'actor_name', v_nombre_a,
    'ref_tipo', 'traslado_almacen', 'ref_codigo', v_codigo, 'destino', v_destino,
    'detalle', 'Traslado ' || v_codigo || ' a ' || v_destino || coalesce(' · ' || v_nota, '') || ' (teléfono)'));
  v_m2 := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_dst.id, 'tipo', 'transferencia', 'delta', v_cant, 'precio_unitario', v_costo,
    'actor', v_actor, 'actor_name', v_nombre_a,
    'ref_tipo', 'traslado_almacen', 'ref_codigo', v_codigo,
    'detalle', 'Traslado ' || v_codigo || ' desde ' || v_origen || coalesce(' · ' || v_nota, '') || ' (teléfono)'));

  return jsonb_build_object(
    'codigo', v_codigo, 'cantidad', v_cant, 'unidad', v_src.unidad,
    'origen', v_origen, 'destino', v_destino,
    'producto_origen_id', v_src.id, 'producto_destino_id', v_dst.id,
    'nombre', v_src.nombre, 'sku_origen', v_src.sku, 'sku_destino', v_dst.sku, 'creado_en_destino', v_creado,
    'stock_origen', v_m1.stock_despues, 'stock_destino', v_m2.stock_despues,
    'nota', v_nota, 'at', v_m2.at);
end $$;

grant execute on function public.inventario_trasladar_deposito(jsonb) to authenticated;
