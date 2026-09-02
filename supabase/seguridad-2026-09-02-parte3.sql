-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 3
-- GT-SIN-16 · El recorte silencioso del stock
--
-- QUÉ PASABA
-- `registrar_movimiento_stock` resolvía el sobregiro con:
--     v_stock_desp := greatest(0, v_stock_antes + v_delta);
-- …pero insertaba el movimiento con el delta COMPLETO. La existencia nunca
-- bajaba de cero, pero el kardex sí registraba la salida entera: las dos tablas
-- dejaban de cuadrar y no se volvían a arreglar solas.
--
-- Con 100 L de aceite, dos salidas simultáneas de 80 y 60 dejaban la existencia
-- en 0 y dos filas de −80 y −60 en el kardex. Desde ahí el reporte de consumo y
-- la valorización mienten, sin ningún aviso.
--
-- QUÉ CAMBIA
-- Ahora, si el stock resultante sería negativo, la función LANZA EXCEPCIÓN y no
-- se escribe nada — ni el movimiento ni la existencia. La validación pasa a
-- estar donde vale (el servidor, bajo el mismo lock que ya toma), no en el
-- navegador. El aviso del front se queda como cortesía.
--
-- LA EXCEPCIÓN: COCINA
-- Cocina DEPENDE del recorte a propósito. Cuando un víver no alcanza,
-- `consumirDeInventario` descuenta igual el faltante para dejar la traza de lo
-- que realmente se cocinó (ver src/modules/cocina/cocina.repository.ts). Si
-- bloqueáramos, el cocinero no podría registrar la comida y se trabaría el
-- turno. Por eso se distingue por `ref_tipo`, no por el tipo de movimiento:
-- Producción usa `consumo`, el MISMO tipo que Cocina, así que filtrar por tipo
-- habría dejado a Producción fuera del bloqueo.
--
-- Resultado: salidas, traslados, producción y todo lo demás bloquean.
-- Solo `ref_tipo = 'cocina'` conserva el comportamiento anterior.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.registrar_movimiento_stock(p jsonb)
returns movimientos
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

  select nombre into v_nombre from public.productos where id = v_producto_id for update;

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

  if v_delta > 0 and v_precio is not null and v_precio >= 0 then
    v_total_qty := v_stock_antes + v_delta;
    if v_total_qty <= 0 then
      v_costo := v_precio;
    else
      v_costo := round((v_stock_antes * v_costo_antes + v_delta * v_precio) / v_total_qty, 4);
    end if;
  else
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


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: debe decir que el bloqueo está puesto.
-- ═══════════════════════════════════════════════════════════════════
select case
         when pg_get_functiondef(p.oid) like '%Stock insuficiente de%' then 'OK · bloqueo activo'
         else 'FALTA · sigue el greatest(0,...)'
       end as estado
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'registrar_movimiento_stock';
