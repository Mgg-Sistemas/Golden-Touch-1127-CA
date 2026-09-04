-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Se unifican los dos «ACEITE VATEL SOYA» en uno solo, medido en UND
--
-- QUÉ PASABA
-- Convivían dos productos para el mismo aceite:
--   · GEN-067 «ACEITE VATEL SOYA»          · GENERAL · BOLSA · 4
--   · GEN-179 «ACEITE VATEL SOYA 12X1LT»   · VÍVERES · UND   · 22
-- Los dos con el mismo precio ($2,77), separados en el buscador y en los
-- reportes, y cocina cargando el consumo en uno solo de ellos.
--
-- SOBREVIVE GEN-179, RENOMBRADO — por qué ese y no el otro
-- GEN-179 es el que tiene respaldo real: su stock entró por la recepción de
-- SP-2026-0130 (24 unidades a $3,23, que dejaron el PMP en $2,77) y cocina lo
-- viene consumiendo del 26/08 al 01/09. GEN-067, en cambio, tiene 4
-- movimientos MANUALES sin costo ni referencia (entra 23, entra 1, sale 24,
-- entra 4) y su precio de $2,77 está tecleado a mano en la ficha, no sale de
-- ninguna compra: su kardex tiene costo 0 en las cuatro filas.
--
-- EL NOMBRE «12X1LT» ENGAÑA, EL HISTORIAL NO
-- Parece una caja de 12 litros, pero cocina lo consume EN MEDIOS (−0,5 en
-- desayunos del 26/08, 29/08 y 01/09). Medio bulto de 12 litros en un
-- desayuno no tiene sentido; media botella de 1 L sí. Se cuenta por botella,
-- así que la unidad correcta es UND y sumar las dos fichas es legítimo, sin
-- factor de conversión. Por eso el sobreviviente pierde el «12X1LT» del
-- nombre: describía un empaque que nunca se usó para contar.
--
-- POR QUÉ NO AL REVÉS
-- Dejar vivo a GEN-067 habría reinterpretado los 10 movimientos de GEN-179
-- —incluidos los consumos de medio— como BOLSAS, y habría tirado el único
-- costo real que hay del producto. Así se reinterpretan 4 filas en vez de 10,
-- y el flujo diario de cocina no se corta.
--
-- QUÉ QUEDA
-- GEN-179 pasa a llamarse «ACEITE VATEL SOYA», recibe las 4 unidades de
-- GEN-067 y queda en 26 UND. GEN-067 se descarga a 0 y se desactiva.
--
-- EL HISTORIAL DE GEN-067 NO SE PIERDE
-- Se desactiva, no se borra: sus 4 movimientos siguen consultables en su
-- ficha, y el nombre queda marcado para que se entienda por qué está ahí.
--
-- ORDEN OBLIGATORIO
-- El índice `productos_nombre_sin_acentos_activos` prohíbe dos productos
-- ACTIVOS con el mismo nombre. Por eso GEN-067 se desactiva ANTES de
-- renombrar GEN-179; al revés el UPDATE choca contra el índice.
--
-- TRAZA
-- El traspaso NO se escribe a mano en las tablas: pasa por
-- `registrar_movimiento_stock`, así que quedan las dos patas en el kardex
-- (salida de GEN-067, entrada a GEN-179) con el mismo código de referencia.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive   uuid;   -- GEN-179, el que sobrevive
  v_muere  uuid;   -- GEN-067, el que se desactiva
  v_stock_muere numeric;
  v_stock_vive  numeric;
  v_costo_muere numeric;
  v_mov    public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id into v_vive  from public.productos where sku = 'GEN-179';
  select id into v_muere from public.productos where sku = 'GEN-067';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron los dos productos.';
  end if;

  select coalesce(sum(stock),0) into v_stock_muere from public.existencias where producto_id = v_muere;
  select coalesce(sum(stock),0) into v_stock_vive  from public.existencias where producto_id = v_vive;
  select coalesce(max(costo_promedio),0) into v_costo_muere
    from public.existencias where producto_id = v_muere;

  -- Guarda: el análisis se hizo sobre 4 y 22. Si cambió, alguien movió algo
  -- entre medio y hay que volver a mirar antes de tocar nada.
  if round(v_stock_muere, 2) <> 4 or round(v_stock_vive, 2) <> 22 then
    raise exception 'ABORTADO: se esperaba GEN-067=4 y GEN-179=22, hay % y %.',
      round(v_stock_muere, 2), round(v_stock_vive, 2);
  end if;

  -- ── 1 · Salen de GEN-067 ─────────────────────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_muere,
    'tipo',        'salida',
    'delta',       -v_stock_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ACEITE-VATEL-2026-09-04',
    'detalle',     'Las 4 unidades pasan a GEN-179 ACEITE VATEL SOYA. GEN-067 decía BOLSA pero sus 4 movimientos son manuales, sin costo ni referencia; el único costo real del producto está en GEN-179.'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron, 4) <> round(v_stock_muere, 4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_stock_muere, v_salieron;
  end if;

  -- ── 2 · Entran a GEN-179, con el costo que traían ────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_vive,
    'tipo',        'entrada',
    'delta',       v_salieron,
    'precio_unitario', v_costo_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-ACEITE-VATEL-2026-09-04',
    'detalle',     'Ingresan las 4 unidades que estaban cargadas en GEN-067 ACEITE VATEL SOYA, que queda desactivado.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron, 4) <> round(v_salieron, 4) then
    raise exception 'ABORTADO: salieron % de GEN-067 pero entraron % a GEN-179.', v_salieron, v_entraron;
  end if;

  -- ── 3 · El que muere se desactiva PRIMERO (índice de nombre único) ─
  update public.productos
     set nombre = 'ACEITE VATEL SOYA (unificado en GEN-179)',
         estado = 'inactivo',
         updated_at = now()
   where id = v_muere;

  -- ── 4 · El sobreviviente pierde el empaque del nombre ─────────────
  update public.productos
     set nombre = 'ACEITE VATEL SOYA', updated_at = now()
   where id = v_vive;

  raise notice 'OK: 4 unidades trasladadas. GEN-179 ACEITE VATEL SOYA queda en 26 UND.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.unidad, p.estado, p.precio,
       (select coalesce(sum(e.stock),0)          from public.existencias e where e.producto_id = p.id) as stock,
       (select coalesce(max(e.costo_promedio),0) from public.existencias e where e.producto_id = p.id) as costo,
       (select count(*) from public.movimientos m where m.producto_id = p.id)                          as movimientos
  from public.productos p
 where p.sku in ('GEN-067','GEN-179')
 order by p.sku;
