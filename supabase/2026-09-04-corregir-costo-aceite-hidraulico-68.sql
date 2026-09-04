-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- GEN-015 ACEITE HIDRAULICO 68 · el total se había tecleado como unitario
--
-- QUÉ PASABA
-- El 20/07 el ADMINISTRADOR cargó a mano una entrada de 60 LITROS con
-- «1500» en el campo de PRECIO UNITARIO. Ese 1.500 es el total de la
-- compra, no lo que cuesta un litro. Como el sistema lo tomó al pie de la
-- letra, el producto quedó valorado a $1.500 POR LITRO:
--   · 40 litros en existencia × $1.500  =  $60.000 de valor de inventario
-- Sobre un inventario de ~$120.000, este solo renglón era la mitad.
--
-- QUÉ SE CORRIGE
-- El administrador indicó que los 40 litros que quedan deben totalizar
-- $1.500. Entonces el costo unitario es 1.500 / 40 = $37,50 por litro, y el
-- renglón pasa a leerse «40 LITROS · $37,50 · $1.500».
--
-- CÓMO SE CORRIGE
-- Con `fijar_costo_producto`, que deja el precio del producto y el costo de
-- la existencia en el mismo número dentro de una sola transacción y anota el
-- ajuste en el kardex con quién lo valoró y cuándo. No mueve stock.
--
-- LO QUE NO SE TOCA — y por qué
-- Las dos filas históricas del kardex quedan como están:
--   · 20/07 · entrada de 60 L a $1.500  (valuada en $90.000)
--   · 14/08 · salida  de 20 L a $1.500  (valuada en $30.000, al Sr. Felipe)
-- Reescribirlas a $37,50 afirmaría que esa compra costó $2.250, y eso no
-- surge de ningún dato: el único número real que hay es el «1500» tecleado,
-- y no sabemos si era el total de los 60 litros o de otra cosa. Corregir la
-- valuación de lo que HAY en existencia es un hecho verificable; reescribir
-- lo que costó una compra de julio sería inventarlo.
-- POR ESO QUEDA PENDIENTE PARA EL ADMINISTRADOR: cuánto costó realmente esa
-- compra del 20/07. Con ese dato se corrigen las dos filas y el reporte de
-- salidas de agosto deja de mostrar $30.000 por 20 litros de aceite.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_id     uuid;
  v_stock  numeric;
  v_antes  numeric;
  v_nuevo  numeric;
begin
  select id, coalesce(precio,0) into v_id, v_antes
    from public.productos where sku = 'GEN-015';
  if v_id is null then
    raise exception 'ABORTADO: no existe GEN-015.';
  end if;

  select coalesce(sum(stock),0) into v_stock
    from public.existencias where producto_id = v_id;

  -- Guardas: el análisis se hizo sobre 40 litros a $1.500. Si cambió alguno,
  -- alguien movió algo entre medio y hay que volver a mirar.
  if round(v_stock, 4) <> 40 then
    raise exception 'ABORTADO: se esperaban 40 litros y hay %.', v_stock;
  end if;
  if round(v_antes, 2) <> 1500 then
    raise exception 'ABORTADO: se esperaba precio 1500 y hay %.', v_antes;
  end if;

  -- Los 40 litros deben totalizar $1.500.
  v_nuevo := round(1500::numeric / v_stock, 2);   -- 37,50

  perform public.fijar_costo_producto(
    v_id, v_nuevo,
    'correccion-costo',
    'Corrección de costo (autorizada por el administrador): el 1.500 era el total, no el litro'
  );

  raise notice 'OK: GEN-015 pasa de $% a $% por litro. 40 L = $1.500.', v_antes, v_nuevo;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.precio as costo_unitario,
       (select coalesce(sum(e.stock),0)          from public.existencias e where e.producto_id=p.id) as stock,
       (select coalesce(max(e.costo_promedio),0) from public.existencias e where e.producto_id=p.id) as costo_existencia,
       (select round(coalesce(sum(e.stock * e.costo_promedio),0), 2)
          from public.existencias e where e.producto_id=p.id)                                        as valor_total
  from public.productos p
 where p.sku = 'GEN-015';
