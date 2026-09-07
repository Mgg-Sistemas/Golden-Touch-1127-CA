-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- 1 · La categoría LIMPIENZA pasa a llamarse LIMPIEZA
-- 2 · Los dos vinagres se unifican en una sola ficha medida en GALON
--
-- ═══ 1 · LIMPIENZA → LIMPIEZA ═══════════════════════════════════════
-- NO ES SOLO UN TIPEO FEO: rompe un filtro de verdad.
-- En Pedidos, `esViveresOLimpieza()` decide qué entra al checklist de la
-- «Solicitud de MERCADO para Cocina» comparando el nombre de la categoría
-- contra el texto 'limpieza'. Y "limpienza" NO contiene "limpieza" —la ene
-- de más lo rompe—, así que los 7 productos de limpieza quedaban FUERA del
-- checklist y había que agregarlos a mano cada vez.
-- (Cocina sí los veía: `esCategoriaViveres()` compara contra el stem "limpi",
-- que cubre las dos grafías. Por eso el problema pasaba desapercibido.)
-- Se renombra en el catálogo (`taxonomias`) y en cascada en los productos.
-- No existe ninguna categoría "LIMPIEZA" previa, así que es un renombrado
-- limpio y no una fusión de dos categorías.
--
-- ═══ 2 · VINAGRE ════════════════════════════════════════════════════
-- Convivían dos fichas del mismo vinagre:
--   · GEN-183 «VINAGRE GALON 5L» · UND · 1 · $7,31
--   · GEN-071 «VINAGRE»          · PAR · 1 · $5,10
-- El administrador confirmó que los dos son el MISMO galón de 5 litros, así
-- que se unifican. Sobrevive GEN-183, que es la que nombra el envase.
--
-- LA MEDIDA PASA A GALON, no a litros ni a UND
-- El vinagre se compra, se guarda y se entrega por envase entero: nadie
-- fracciona un galón en la cocina. Medirlo en GALON es lo que se hace de
-- verdad, y evita el error de siempre —cargar el precio del envase como si
-- fuera el del litro—, que es exactamente lo que había pasado con el aceite
-- hidráulico. El «5L» queda en el NOMBRE, que es donde va la referencia del
-- contenido. GALON se agrega al catálogo de medidas para que quede elegible.
-- «PAR», la medida que traía GEN-071, no describe nada acá: es el arrastre
-- del selector cuando se crea un producto sin elegir medida.
--
-- EL COSTO: $7,31 EL GALON
-- El administrador indicó que el total de esos 5 litros es $7,31, o sea que
-- un galón cuesta $7,31. El traslado por kardex dejaría un promedio ponderado
-- entre $7,31 y $5,10 (= $6,21); se fija en $7,31 a mano DESPUÉS del traslado
-- porque el dato correcto lo da el administrador, no el promedio de una carga
-- vieja. Quedan 2 galones = $14,62.
--
-- TRAZA
-- El traslado pasa por `registrar_movimiento_stock` (las dos patas en el
-- kardex con el mismo código de referencia) y el costo por
-- `fijar_costo_producto`, que deja su propio ajuste. Nada se escribe a mano
-- sobre las tablas de stock.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1 · La categoría ────────────────────────────────────────────────
do $$
declare
  v_ya    int;
  v_prods int;
begin
  select count(*) into v_ya from public.productos where categoria = 'LIMPIEZA';
  if v_ya > 0 then
    raise exception 'ABORTADO: ya hay % producto(s) en LIMPIEZA. Esto seria una FUSION de dos categorias, no un renombrado, y hay que mirarla aparte.', v_ya;
  end if;

  update public.taxonomias
     set valor = 'LIMPIEZA'
   where scope = 'inventario.categoria' and valor = 'LIMPIENZA';

  update public.productos
     set categoria = 'LIMPIEZA', updated_at = now()
   where categoria = 'LIMPIENZA';
  get diagnostics v_prods = row_count;

  raise notice 'OK: categoria renombrada en % producto(s).', v_prods;
end $$;


-- ── 2 · El vinagre ──────────────────────────────────────────────────
do $$
declare
  v_vive   uuid;   -- GEN-183, el que sobrevive
  v_muere  uuid;   -- GEN-071, el que se desactiva
  v_stock_muere numeric;
  v_stock_vive  numeric;
  v_costo_muere numeric;
  v_mov    public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id into v_vive  from public.productos where sku = 'GEN-183';
  select id into v_muere from public.productos where sku = 'GEN-071';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron los dos vinagres.';
  end if;

  select coalesce(sum(stock),0) into v_stock_muere from public.existencias where producto_id = v_muere;
  select coalesce(sum(stock),0) into v_stock_vive  from public.existencias where producto_id = v_vive;
  select coalesce(max(costo_promedio),0) into v_costo_muere
    from public.existencias where producto_id = v_muere;

  -- Guarda: el análisis se hizo sobre 1 y 1. Si cambió, alguien movió algo.
  if round(v_stock_muere,2) <> 1 or round(v_stock_vive,2) <> 1 then
    raise exception 'ABORTADO: se esperaba GEN-071=1 y GEN-183=1, hay % y %.',
      round(v_stock_muere,2), round(v_stock_vive,2);
  end if;

  -- 2.1 · GALON entra al catálogo de medidas (si no estaba).
  if not exists (select 1 from public.taxonomias
                  where scope = 'inventario.unidad' and upper(valor) = 'GALON') then
    insert into public.taxonomias (scope, valor, created_by)
    values ('inventario.unidad', 'GALON', 'unificacion-productos');
  end if;

  -- 2.2 · Sale de GEN-071.
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_muere,
    'tipo',        'salida',
    'delta',       -v_stock_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-VINAGRE-2026-09-07',
    'detalle',     'El galón pasa a GEN-183 VINAGRE GALON 5L. GEN-071 decía PAR, que no describe el envase: es el arrastre del selector al crear el producto.'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron,4) <> round(v_stock_muere,4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_stock_muere, v_salieron;
  end if;

  -- 2.3 · Entra a GEN-183 con el costo que traía.
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_vive,
    'tipo',        'entrada',
    'delta',       v_salieron,
    'precio_unitario', v_costo_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-VINAGRE-2026-09-07',
    'detalle',     'Ingresa el galón que estaba cargado en GEN-071 VINAGRE, que queda desactivado.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron,4) <> round(v_salieron,4) then
    raise exception 'ABORTADO: salió % de GEN-071 pero entró % a GEN-183.', v_salieron, v_entraron;
  end if;

  -- 2.4 · El que muere se desactiva PRIMERO (índice de nombre único).
  update public.productos
     set nombre = 'VINAGRE (unificado en GEN-183)',
         estado = 'inactivo',
         updated_at = now()
   where id = v_muere;

  -- 2.5 · El sobreviviente queda medido en GALON.
  update public.productos
     set unidad = 'GALON', updated_at = now()
   where id = v_vive;

  -- 2.6 · Y el galón vale $7,31, según el administrador (no el promedio).
  perform public.fijar_costo_producto(
    v_vive, 7.31,
    'unificacion-productos',
    'Unificación de vinagre: el galón de 5 L vale $7,31 (dato del administrador)'
  );

  raise notice 'OK: GEN-183 queda con 2 GALON a $7,31 = $14,62.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select 'categoria' as que, categoria as valor, count(*)::text as dato
  from public.productos where categoria in ('LIMPIEZA','LIMPIENZA') group by categoria
union all
select 'medida en catalogo', valor, scope
  from public.taxonomias where scope='inventario.unidad' and upper(valor)='GALON'
union all
select 'vinagre ' || p.sku, p.nombre || ' · ' || p.unidad || ' · ' || p.estado,
       'stock ' || (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id=p.id)::text
       || ' · costo $' || (select coalesce(max(e.costo_promedio),0) from public.existencias e where e.producto_id=p.id)::text
  from public.productos p where p.sku in ('GEN-183','GEN-071')
order by 1;
