-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Las esponjas doble uso quedan en una sola ficha: LIM-001
--
-- QUÉ PASABA
--   · LIM-001 «ESPONJAS DOBLE USO»   · UND · 8 · $1,0444 · 4 movim. · LIMPIEZA
--   · GEN-186 «ESPONJA DOBLE USO 1U» · UND · 4 · $1,2700 · 1 movim. · GENERAL
-- La misma esponja en dos fichas. GEN-186 nació en GENERAL, que es donde caen
-- las fichas creadas al vuelo cuando alguien no encuentra la que ya existe.
--
-- LO QUE FIJÓ EL ADMINISTRADOR
-- «Que sea categoría LIMPIEZA, ESPONJAS DOBLE USO, LIM-001; este se mantiene
-- y se unifica con lo otro.» Nombre, categoría y ficha sobreviviente. Las dos
-- primeras ya quedaron así esta mañana, cuando la categoría «LIMPIENZA» se
-- corrigió a «LIMPIEZA»; el script las vuelve a dejar escritas igual para que
-- sea una sola constancia de las tres cosas, y no dependa de recordar que una
-- ya venía hecha.
--
-- ESTA ES LA ÚLTIMA DE LAS SEIS «CON MATERIAL EN JUEGO»
-- Y también mueve material: las 4 unidades de GEN-186 pasan a LIM-001, que
-- queda con 12. El traslado va por `registrar_movimiento_stock` —las dos
-- patas en el kardex con el mismo código de referencia—, nunca escribiendo a
-- mano sobre las tablas de stock.
--
-- EL COSTO SUBE, Y ESTÁ BIEN QUE SUBA
-- Las 8 de LIM-001 costaron $1,0444 y las 4 de GEN-186 costaron $1,27. El
-- promedio ponderado de las 12 queda en $1,1196:
--   (8 × 1,0444 + 4 × 1,2700) / 12 = 13,4352 / 12 = 1,1196
-- El valor total del material no cambia: $8,36 + $5,08 = $13,44 antes y
-- después. Lo único que cambia es que ahora está en una sola ficha.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive     uuid;   -- LIM-001, la que se mantiene
  v_muere    uuid;   -- GEN-186, la creada al vuelo en GENERAL
  v_stock_m  numeric;
  v_stock_v  numeric;
  v_costo_m  numeric;
  v_ocs      int;
  v_mov      public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id into v_vive  from public.productos where sku = 'LIM-001';
  select id into v_muere from public.productos where sku = 'GEN-186';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas de esponjas.';
  end if;

  select coalesce(sum(stock),0) into v_stock_m from public.existencias where producto_id = v_muere;
  select coalesce(sum(stock),0) into v_stock_v from public.existencias where producto_id = v_vive;
  select coalesce(max(costo_promedio),0) into v_costo_m
    from public.existencias where producto_id = v_muere;

  -- Guarda 1 · el analisis se hizo sobre 8 y 4.
  if round(v_stock_m,2) <> 4 or round(v_stock_v,2) <> 8 then
    raise exception 'ABORTADO: se esperaba GEN-186=4 y LIM-001=8, hay % y %. Alguien movio esponjas: hay que rehacer las cuentas.',
      round(v_stock_m,2), round(v_stock_v,2);
  end if;

  -- Guarda 2 · GEN-186 no puede estar comprometida en una orden viva: al
  -- desactivarla, ese renglon quedaria apuntando a una ficha que nadie mira.
  select count(*) into v_ocs
    from public.ordenes o
   where o.items::text like '%' || v_muere::text || '%'
     and o.estado not in ('finalizada','cancelada');
  if v_ocs > 0 then
    raise exception 'ABORTADO: GEN-186 aparece en % orden(es) viva(s). Hay que reapuntar esos renglones a LIM-001 antes de desactivarla.', v_ocs;
  end if;

  -- ── 1 · Salen las 4 esponjas de GEN-186 ──────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_muere,
    'tipo',        'salida',
    'delta',       -v_stock_m,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ESPONJAS-2026-09-07',
    'detalle',     'Las 4 unidades pasan a LIM-001. Es la misma esponja: GEN-186 se creo al vuelo en GENERAL cuando ya existia la ficha de LIMPIEZA.'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron,4) <> round(v_stock_m,4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_stock_m, v_salieron;
  end if;

  -- ── 2 · Entran a LIM-001 con el costo que traian ─────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_vive,
    'tipo',        'entrada',
    'delta',       v_salieron,
    'precio_unitario', v_costo_m,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ESPONJAS-2026-09-07',
    'detalle',     'Ingresan las 4 unidades que estaban en GEN-186, que queda desactivado.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron,4) <> round(v_salieron,4) then
    raise exception 'ABORTADO: salieron % de GEN-186 pero entraron % a LIM-001.', v_salieron, v_entraron;
  end if;

  -- ── 3 · La ficha creada al vuelo se desactiva ────────────────────
  update public.productos
     set nombre = 'ESPONJA DOBLE USO 1U (unificado en LIM-001)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  -- ── 4 · Nombre y categoria de la que queda, tal como se fijaron ──
  -- Ya estaban asi desde la correccion LIMPIENZA → LIMPIEZA de esta mañana;
  -- se dejan escritos igual para que este script valga como constancia.
  update public.productos
     set nombre = 'ESPONJAS DOBLE USO',
         categoria = 'LIMPIEZA',
         updated_at = now()
   where id = v_vive
     and (nombre <> 'ESPONJAS DOBLE USO' or categoria <> 'LIMPIEZA');

  raise notice 'OK: LIM-001 queda con 12 unidades en LIMPIEZA.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.unidad, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select round(coalesce(max(e.costo_promedio),0),4) from public.existencias e where e.producto_id = p.id) as costo,
       (select round(coalesce(sum(e.stock*e.costo_promedio),0),2) from public.existencias e where e.producto_id = p.id) as valor,
       (select count(*) from public.movimientos m where m.producto_id = p.id) as movimientos
  from public.productos p
 where p.sku in ('LIM-001','GEN-186')
 order by p.estado;
