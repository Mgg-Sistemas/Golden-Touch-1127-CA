/* ============================================================
   GOLDEN TOUCH · Inventario · El costo no se pierde
   ------------------------------------------------------------
   REGLA DE NEGOCIO
   Un producto que se queda en 0 CONSERVA su precio. El precio es
   lo que vale UNA unidad; que no quede ninguna en el estante no
   cambia cuánto cuesta reponerla. Lo que sí depende del stock es
   el VALOR del inventario, que es stock x precio: con stock 0 el
   producto aporta 0 y vuelve a aportar solo cuando entra material.

   QUÉ SE ARREGLA
   `registrar_movimiento_stock` recalculaba el promedio ponderado
   (PMP) con CUALQUIER precio informado, incluido el 0. Una entrada
   cargada sin precio -una recepción sin tasa, una compra directa
   creada con precio 0- promediaba ese 0 contra el costo guardado y
   lo APLASTABA. El producto se quedaba con material y sin valor.
   Pasó de verdad: GEN-067 ACEITE VATEL SOYA entró 23 unidades el
   11/08 con precio 0 y hoy tiene stock y costo 0.

   Ahora un precio 0 significa «no me informaron precio», no
   «vale cero»:
     · con precio informado (> 0)  -> PMP normal, como siempre;
     · sin precio y con costo previo -> se conserva el costo previo;
     · sin precio y sin costo previo -> se hereda productos.precio,
       que es lo último que se sabe que vale esa unidad.

   Se agrega además `fijar_costo_producto`: carga el costo unitario
   de un producto en un solo paso atómico (productos.precio +
   existencias.costo_promedio) y deja el ajuste en el kardex con
   quién lo valoró y cuándo. Es lo que usa «Costos y medidas» en
   Inventario para cargar los productos que nunca tuvieron precio.
   ============================================================ */

-- ── 1 · El precio 0 deja de aplastar el costo ────────────────
create or replace function public.registrar_movimiento_stock(p jsonb)
returns public.movimientos
language plpgsql
as $function$
declare
  v_producto_id uuid := (p->>'producto_id')::uuid;
  v_almacen     text := 'General';   -- inventario único: siempre General
  v_delta       numeric := coalesce((p->>'delta')::numeric, 0);
  v_tipo        public.tipo_movimiento := (p->>'tipo')::public.tipo_movimiento;
  v_ref_tipo    text := coalesce(p->>'ref_tipo', 'manual');
  v_precio      numeric;
  v_nombre      text;
  v_precio_prod numeric := 0;
  v_stock_antes numeric := 0;
  v_costo_antes numeric := 0;
  v_stock_desp  numeric;
  v_costo       numeric;
  v_total_qty   numeric;
  v_total_stock numeric;
  v_valor       numeric;
  v_mov         public.movimientos;
begin
  if v_producto_id is null then
    raise exception 'producto_id requerido';
  end if;

  select nombre, coalesce(precio, 0)
    into v_nombre, v_precio_prod
    from public.productos where id = v_producto_id for update;

  begin
    v_precio := nullif(p->>'precio_unitario','')::numeric;
  exception when others then
    v_precio := null;
  end;

  select coalesce(stock,0), coalesce(costo_promedio,0)
    into v_stock_antes, v_costo_antes
    from public.existencias
   where producto_id = v_producto_id and almacen = v_almacen
   for update;
  v_stock_antes := coalesce(v_stock_antes, 0);
  v_costo_antes := coalesce(v_costo_antes, 0);

  -- ── GT-SIN-16 ────────────────────────────────────────────────────
  v_stock_desp := v_stock_antes + v_delta;
  if v_stock_desp < 0 then
    if v_ref_tipo = 'cocina' then
      -- Cocina deja la traza del faltante (comportamiento previo, a propósito).
      v_stock_desp := 0;
    else
      raise exception 'Stock insuficiente de "%": hay % y se intentaron sacar %.',
        coalesce(v_nombre, 'este producto'),
        trim(to_char(v_stock_antes, 'FM999999990.####')),
        trim(to_char(abs(v_delta),  'FM999999990.####'))
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── El costo ────────────────────────────────────────────────────
  -- Un precio 0 NO es «vale cero»: es «no me informaron precio». Antes
  -- entraba al promedio y aplastaba el costo guardado; ahora no lo toca.
  if v_delta > 0 and v_precio is not null and v_precio > 0 then
    v_total_qty := v_stock_antes + v_delta;
    if v_total_qty <= 0 then
      v_costo := v_precio;
    else
      v_costo := round((v_stock_antes * v_costo_antes + v_delta * v_precio) / v_total_qty, 4);
    end if;
  elsif v_delta > 0 and v_costo_antes <= 0 then
    -- Entrada sin precio y sin costo guardado: se hereda el precio del
    -- producto, que es lo último que se sabe que vale esa unidad. Si el
    -- producto tampoco tiene precio queda 0 y aparece en «Costos y medidas».
    v_costo := greatest(coalesce(v_precio_prod, 0), 0);
  else
    -- Salidas, ajustes y entradas sin precio: el costo guardado se conserva.
    -- Aquí es donde un producto que baja a 0 MANTIENE su precio.
    v_costo := v_costo_antes;
  end if;

  insert into public.movimientos (
    producto_id, tipo, delta, almacen, stock_antes, stock_despues,
    actor, actor_name, ref_tipo, ref_id, ref_codigo, proveedor_id,
    detalle, destino, solicitante, nota_entrega, fecha_entrega,
    precio_unitario, costo_promedio, at
  ) values (
    v_producto_id, v_tipo, v_delta, v_almacen, v_stock_antes, v_stock_desp,
    p->>'actor', p->>'actor_name', v_ref_tipo,
    p->>'ref_id', p->>'ref_codigo', nullif(p->>'proveedor_id','')::uuid,
    p->>'detalle', p->>'destino', p->>'solicitante', p->>'nota_entrega',
    nullif(p->>'fecha_entrega','')::date,
    v_precio, v_costo, coalesce(nullif(p->>'at','')::timestamptz, now())
  ) returning * into v_mov;

  insert into public.existencias (producto_id, almacen, stock, costo_promedio, updated_at)
  values (v_producto_id, v_almacen, v_stock_desp, v_costo, now())
  on conflict (producto_id, almacen)
  do update set stock = excluded.stock, costo_promedio = excluded.costo_promedio, updated_at = now();

  -- El VALOR sí depende del stock: con 0 unidades el producto aporta 0.
  -- Pero productos.precio NO se toca cuando no hay stock: se conserva.
  select coalesce(sum(stock),0), coalesce(sum(stock*costo_promedio),0)
    into v_total_stock, v_valor
    from public.existencias where producto_id = v_producto_id;
  if v_total_stock > 0 and v_valor > 0 then
    update public.productos
       set stock = v_total_stock, precio = round(v_valor / v_total_stock, 2)
     where id = v_producto_id;
  else
    update public.productos set stock = v_total_stock where id = v_producto_id;
  end if;

  if v_tipo in ('fundicion','fin_fundicion') then
    update public.productos set en_fundicion = (v_tipo = 'fundicion') where id = v_producto_id;
  end if;

  return v_mov;
end;
$function$;

-- ── 2 · Cargar el costo de un producto en un solo paso ───────
/* Deja el precio del producto y el costo de su existencia en el mismo
   número, dentro de la misma transacción, y anota el ajuste en el kardex.
   No mueve stock: delta = 0. Devuelve el producto ya actualizado. */
create or replace function public.fijar_costo_producto(
  p_producto_id uuid,
  p_precio      numeric,
  p_actor       text default null,
  p_actor_name  text default null
) returns public.productos
language plpgsql
as $function$
declare
  v_almacen     text := 'General';
  v_precio      numeric := round(greatest(coalesce(p_precio, 0), 0), 2);
  v_antes       numeric := 0;
  v_stock       numeric := 0;
  v_prod        public.productos;
begin
  if p_producto_id is null then
    raise exception 'producto_id requerido';
  end if;
  if v_precio <= 0 then
    raise exception 'El costo unitario debe ser mayor que 0.' using errcode = 'check_violation';
  end if;

  select coalesce(precio, 0) into v_antes
    from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'El producto no existe.';
  end if;

  update public.productos set precio = v_precio, updated_at = now()
   where id = p_producto_id;

  select coalesce(stock, 0) into v_stock
    from public.existencias
   where producto_id = p_producto_id and almacen = v_almacen for update;
  v_stock := coalesce(v_stock, 0);

  insert into public.existencias (producto_id, almacen, stock, costo_promedio, updated_at)
  values (p_producto_id, v_almacen, v_stock, v_precio, now())
  on conflict (producto_id, almacen)
  do update set costo_promedio = excluded.costo_promedio, updated_at = now();

  insert into public.movimientos (
    producto_id, tipo, delta, almacen, stock_antes, stock_despues,
    actor, actor_name, ref_tipo, detalle, precio_unitario, costo_promedio, at
  ) values (
    p_producto_id, 'ajuste', 0, v_almacen, v_stock, v_stock,
    coalesce(p_actor, 'sistema'), p_actor_name, 'costo',
    'Costo unitario cargado desde Inventario: ' ||
      trim(to_char(v_precio, 'FM999999990.00')) || ' $ (antes ' ||
      trim(to_char(v_antes,  'FM999999990.00')) || ' $)',
    v_precio, v_precio, now()
  );

  select * into v_prod from public.productos where id = p_producto_id;
  return v_prod;
end;
$function$;

comment on function public.fijar_costo_producto(uuid, numeric, text, text) is
  'Carga el costo unitario de un producto (productos.precio + existencias.costo_promedio) sin mover stock y lo deja anotado en el kardex. Lo usa «Costos y medidas» en Inventario.';

grant execute on function public.fijar_costo_producto(uuid, numeric, text, text) to authenticated;
