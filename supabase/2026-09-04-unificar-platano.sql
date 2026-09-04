-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Se unifican los dos «plátano» en uno solo, medido en UND
--
-- QUÉ PASABA
-- Convivían dos productos para la misma fruta:
--   · VIV-014 «Plátano»  · VÍVERES              · UND         · 41
--   · HOR-007 «PLATANO»  · HORTALIZAS Y LEGUM.  · KILOGRAMOS  · 20
-- En los buscadores aparecían como duplicados y cocina cargaba el consumo
-- en uno o en otro según quién lo hiciera.
--
-- LA UNIDAD DE HOR-007 ESTABA MAL PUESTA — esto es lo que habilita la fusión
-- Decía KILOGRAMOS pero NUNCA se usó en kilos: sus recepciones son 33, 33 y
-- 25 exactos y cocina consume −2, −2, −2, −1. Eso son plátanos contados, no
-- kilos. Hoy mismo alguien le hizo un «AJUSTE MANUAL PARA REALIDAD» que lo
-- dejó en 20 — o sea, los contó. VIV-014 es igual: 50, −18, −4, +33, −20.
-- Los dos venían siendo unidades; solo uno tenía la etiqueta correcta.
-- Por eso sumarlos es legítimo y no hace falta ningún factor de conversión.
--
-- QUÉ QUEDA
-- Sobrevive VIV-014, renombrado a «PLÁTANO» (mayúscula y con tilde, como
-- pidió el administrador). Se le suman las 20 unidades de HOR-007 y queda
-- en 61 UND. HOR-007 se descarga a 0 y se desactiva.
--
-- POR QUÉ SOBREVIVE VIV-014 Y NO HOR-007
-- Ya tenía la unidad correcta (UND), así que ninguna de sus filas históricas
-- cambia de significado. Renombrar la unidad de HOR-007 habría reinterpretado
-- 19 movimientos viejos de «kilos» a «unidades» sin poder probarlo fila por
-- fila. Además VIV-014 es el que recibió stock ayer: es el que está en uso.
--
-- EL HISTORIAL DE HOR-007 NO SE PIERDE
-- Se desactiva, no se borra: sus 19 movimientos siguen consultables en su
-- ficha, y el nombre queda marcado para que se entienda por qué está ahí.
--
-- TRAZA
-- El traspaso NO se escribe a mano en las tablas: pasa por
-- `registrar_movimiento_stock`, así que quedan las dos patas en el kardex
-- (salida de HOR-007, entrada a VIV-014) con el mismo código de referencia.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_viv    uuid;
  v_hor    uuid;
  v_stock_hor  numeric;
  v_stock_viv  numeric;
  v_mov    public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id into v_viv from public.productos where sku = 'VIV-014';
  select id into v_hor from public.productos where sku = 'HOR-007';
  if v_viv is null or v_hor is null then
    raise exception 'ABORTADO: no se encontraron los dos productos.';
  end if;

  select coalesce(sum(stock),0) into v_stock_hor from public.existencias where producto_id = v_hor;
  select coalesce(sum(stock),0) into v_stock_viv from public.existencias where producto_id = v_viv;

  -- Guarda: el análisis se hizo sobre 20 y 41. Si cambió, alguien movió algo
  -- entre medio y hay que volver a mirar antes de tocar nada.
  if round(v_stock_hor, 2) <> 20 or round(v_stock_viv, 2) <> 41 then
    raise exception 'ABORTADO: se esperaba HOR-007=20 y VIV-014=41, hay % y %.',
      round(v_stock_hor, 2), round(v_stock_viv, 2);
  end if;

  -- ── 1 · Sale de HOR-007 ──────────────────────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_hor,
    'tipo',        'salida',
    'delta',       -v_stock_hor,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-PLATANO-2026-09-04',
    'detalle',     'Las 20 unidades pasan a VIV-014 PLÁTANO. HOR-007 decía KILOGRAMOS pero su historial son conteos (recepciones de 33/33/25 y consumos de 2), no kilos.'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron, 4) <> round(v_stock_hor, 4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_stock_hor, v_salieron;
  end if;

  -- ── 2 · Entra a VIV-014 ──────────────────────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_viv,
    'tipo',        'entrada',
    'delta',       v_salieron,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-PLATANO-2026-09-04',
    'detalle',     'Ingresan las 20 unidades que estaban cargadas en HOR-007 PLATANO, que queda desactivado.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron, 4) <> round(v_salieron, 4) then
    raise exception 'ABORTADO: salieron % de HOR-007 pero entraron % a VIV-014.', v_salieron, v_entraron;
  end if;

  -- ── 3 · El sobreviviente queda con el nombre acordado ─────────────
  update public.productos
     set nombre = 'PLÁTANO', updated_at = now()
   where id = v_viv;

  -- ── 4 · El otro se desactiva, con el motivo escrito en el nombre ──
  update public.productos
     set nombre = 'PLÁTANO (unificado en VIV-014)',
         estado = 'inactivo',
         updated_at = now()
   where id = v_hor;

  raise notice 'OK: 20 unidades trasladadas. VIV-014 PLÁTANO queda en 61 UND.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.estado,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select count(*) from public.movimientos m where m.producto_id = p.id)                  as movimientos
  from public.productos p
 where p.sku in ('VIV-014','HOR-007')
 order by p.sku desc;
