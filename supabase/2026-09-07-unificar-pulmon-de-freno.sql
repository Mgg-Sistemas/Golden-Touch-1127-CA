-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Los dos «pulmón de freno europeo 20/24» se unifican en GEN-175
--
-- QUÉ PASABA
--   · GEN-175 «PULMON FRENO EUROPEO 20/24 TRAKKER» · UND  · 1 · $182,00
--   · GEN-069 «PULMON DE FRENO EUROPEO 20/24»      · CAJA · 0 · $0,00
--
-- SOBREVIVE GEN-175
-- Es la única de las dos que existe de verdad: tiene la pieza en el estante,
-- su costo real de $182 y su movimiento de entrada por OC-2026-0088
-- (SP-2026-0129, ya finalizada). GEN-069 nunca se usó — cero stock, cero
-- movimientos, cero órdenes, ni siquiera una cancelada — y además está medida
-- en CAJA, que no describe cómo se compra ni cómo se entrega la pieza.
-- Verificado leyendo el estado real de las órdenes, no un conteo.
--
-- Como GEN-069 está vacía, unificar no mueve material: es desactivarla.
-- Se desactiva, no se borra, y el nombre queda marcado con el SKU que la
-- reemplaza. Volver atrás es reactivarla desde la ficha.
--
-- EL NOMBRE DE GEN-175 NO SE TOCA
-- El informe preguntaba si «TRAKKER» la hace específica de ese camión o si el
-- 20/24 sirve para cualquier europeo. El administrador no pidió cambiarlo, así
-- que queda como está: un nombre de más es un detalle, y quitarle la marca a
-- una pieza que sí es específica sería peor que dejarla nombrada de más.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive  uuid;   -- GEN-175
  v_muere uuid;   -- GEN-069
  v_stock_muere numeric;
  v_movs_muere  int;
begin
  select id into v_vive  from public.productos where sku = 'GEN-175';
  select id into v_muere from public.productos where sku = 'GEN-069';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas.';
  end if;

  -- Guarda: la que sale tiene que estar vacía. Si aparecieron unidades o
  -- movimientos, esto deja de ser un desactivar y necesita traslado por kardex.
  select coalesce(sum(stock),0) into v_stock_muere from public.existencias where producto_id = v_muere;
  select count(*) into v_movs_muere from public.movimientos where producto_id = v_muere;
  if round(v_stock_muere,4) <> 0 or v_movs_muere > 0 then
    raise exception 'ABORTADO: GEN-069 tiene stock=% y % movimiento(s). Ya no esta vacia y hace falta un traslado con analisis propio.',
      v_stock_muere, v_movs_muere;
  end if;

  update public.productos
     set nombre = 'PULMON DE FRENO EUROPEO 20/24 (unificado en GEN-175)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  raise notice 'OK: GEN-069 desactivada. GEN-175 queda sola con su pieza.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.categoria, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select count(*) from public.movimientos m where m.producto_id = p.id)                 as movimientos
  from public.productos p
 where p.sku in ('GEN-069','GEN-175')
 order by p.estado, p.sku;
