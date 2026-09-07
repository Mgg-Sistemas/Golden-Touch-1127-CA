-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- El arroz queda en una sola ficha: VIV-001, medida en paquetes
--
-- QUÉ PASABA
--   · VIV-001 «ARROZ MARY PREMI 24U 900G» · UND · 59,5 · $1,2058 · 41 movim.
--   · INS-022 «ARROZ»                     · KILOGRAMOS · 5 · $1,0183 · 4 movim.
-- Es el mismo arroz con dos fichas y, peor, en dos medidas distintas: un kilo
-- no es un paquete de 900 g, así que los dos stocks no se podían sumar sin
-- convertir. Por eso este par quedó pendiente cuando los otros ya estaban
-- resueltos: no faltaba una decisión, faltaba un factor.
--
-- LA REGLA QUE FIJÓ EL ADMINISTRADOR
-- «Se pasa a donde hay stock por unidad, y donde hay más movimientos.»
-- Las dos cosas apuntan a VIV-001: es la que cocina descuenta todos los días
-- (41 movimientos, el último el 5/9) y la que está en la unidad con la que se
-- compra y se consume. INS-022 no se toca desde el 21/08.
--
-- EL FACTOR: 1 paquete = 900 g  →  5 kg ÷ 0,9 = 5,56 paquetes
-- El traslado NO copia el número: lo convierte. Y no convierte solo la
-- cantidad, también el dinero: los 5 kg valen 5 × $1,0183 = $5,09, y ese mismo
-- valor se reparte entre los 5,56 paquetes que entran ($0,9157 cada uno). Así
-- el inventario vale exactamente lo mismo antes y después; lo único que cambia
-- es en qué unidad está expresado.
--
-- ⚠ UN HALLAZGO QUE NO CAMBIA ESTE SCRIPT, PERO HAY QUE MIRAR EN EL ALMACÉN
-- El kardex de INS-022 sugiere que esa ficha nunca fue de kilos de verdad: los
-- 72 que entraron por SP-2026-0046 el 23/07 están cargados como «Kg», pero 72
-- es exactamente 3 bultos de 24 paquetes —el mismo número, 72, con el que
-- entró VIV-001 por SP-2026-0130— y en este campamento el arroz se compra por
-- bulto y se consume por paquete, no a granel. Si el almacén confirma que esos
-- 5 son 5 PAQUETES y no 5 kilos, la conversión sobra y habría que dejar 5,00
-- en vez de 5,56. La diferencia es medio kilo de arroz (~$0,51), así que se
-- aplica la conversión aprobada y se deja el dato anotado, en vez de trabar
-- todo por medio kilo.
--
-- CÓMO SE APLICA
-- El traslado pasa por `registrar_movimiento_stock` —las dos patas en el
-- kardex con el mismo código de referencia—, no se escribe a mano sobre las
-- tablas de stock. El promedio ponderado de VIV-001 baja de $1,2058 a ~$1,18
-- porque el arroz que entra venía más barato: eso es correcto, es lo que hace
-- un promedio ponderado.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive     uuid;   -- VIV-001, la que cocina usa
  v_muere    uuid;   -- INS-022, la ficha en kilos
  v_kg       numeric;
  v_stock_v  numeric;
  v_costo_kg numeric;
  v_valor    numeric;
  v_paquetes numeric;
  v_precio   numeric;
  v_unidad_v text;
  v_ocs      int;
  v_mov      public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id, unidad into v_vive, v_unidad_v from public.productos where sku = 'VIV-001';
  select id into v_muere from public.productos where sku = 'INS-022';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas de arroz.';
  end if;

  -- Guarda 1 · la que sobrevive tiene que estar en UND. Si alguien le cambio
  -- la medida, convertir kilos contra ella seria inventar una equivalencia.
  if coalesce(v_unidad_v,'') <> 'UND' then
    raise exception 'ABORTADO: VIV-001 esta en % y se esperaba UND. El factor 900 g deja de aplicar.', v_unidad_v;
  end if;

  select coalesce(sum(stock),0) into v_kg      from public.existencias where producto_id = v_muere;
  select coalesce(sum(stock),0) into v_stock_v from public.existencias where producto_id = v_vive;
  select coalesce(max(costo_promedio),0) into v_costo_kg
    from public.existencias where producto_id = v_muere;

  -- Guarda 2 · el analisis se hizo sobre 5 kg y 59,5 paquetes.
  if round(v_kg,2) <> 5 or round(v_stock_v,2) <> 59.5 then
    raise exception 'ABORTADO: se esperaba INS-022=5 y VIV-001=59,5, hay % y %. Alguien movio arroz: hay que rehacer las cuentas.',
      round(v_kg,2), round(v_stock_v,2);
  end if;

  -- Guarda 3 · INS-022 no puede estar comprometida en una orden viva.
  select count(*) into v_ocs
    from public.ordenes o
   where o.items::text like '%' || v_muere::text || '%'
     and o.estado not in ('finalizada','cancelada');
  if v_ocs > 0 then
    raise exception 'ABORTADO: INS-022 aparece en % orden(es) viva(s). Hay que reapuntar esos renglones a VIV-001 antes de desactivarla.', v_ocs;
  end if;

  -- ── La conversion, en un solo lugar ──────────────────────────────
  v_valor    := round(v_kg * v_costo_kg, 4);          -- 5 × $1,0183 = $5,0915
  v_paquetes := round(v_kg / 0.9, 2);                 -- 5 / 0,9     = 5,56
  v_precio   := round(v_valor / v_paquetes, 4);       -- $5,0915/5,56 = $0,9157
  if v_paquetes <= 0 then
    raise exception 'ABORTADO: la conversion dio % paquetes.', v_paquetes;
  end if;

  -- ── 1 · Salen los kilos de INS-022 ───────────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_muere,
    'tipo',        'salida',
    'delta',       -v_kg,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ARROZ-2026-09-07',
    'detalle',     'Los 5 kg pasan a VIV-001 convertidos a paquetes de 900 g (5 / 0,9 = 5,56). Es el mismo arroz en dos fichas y dos medidas.'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron,4) <> round(v_kg,4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_kg, v_salieron;
  end if;

  -- ── 2 · Entran los paquetes a VIV-001, con el mismo dinero ───────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_vive,
    'tipo',        'entrada',
    'delta',       v_paquetes,
    'precio_unitario', v_precio,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ARROZ-2026-09-07',
    'detalle',     'Ingresan los 5 kg que estaban en INS-022, convertidos a 5,56 paquetes de 900 g. El valor no cambia: $5,09 antes y despues.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron,4) <> round(v_paquetes,4) then
    raise exception 'ABORTADO: se convirtieron % paquetes pero entraron %.', v_paquetes, v_entraron;
  end if;

  -- ── 3 · La ficha en kilos se retira ──────────────────────────────
  update public.productos
     set nombre = 'ARROZ (ficha en kilos · unificado en VIV-001)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  raise notice 'OK: VIV-001 queda con % paquetes; entraron % a $% cada uno.',
    round(v_stock_v + v_paquetes,2), v_paquetes, v_precio;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select round(coalesce(max(e.costo_promedio),0),4) from public.existencias e where e.producto_id = p.id) as costo,
       (select round(coalesce(sum(e.stock*e.costo_promedio),0),2) from public.existencias e where e.producto_id = p.id) as valor,
       (select count(*) from public.movimientos m where m.producto_id = p.id) as movimientos
  from public.productos p
 where p.sku in ('VIV-001','INS-022')
 order by p.estado;
