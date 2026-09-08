-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 08/09/2026
-- MONTE SURTIDO pasa a contarse como comida
--
-- QUÉ PASABA
-- MONTE SURTIDO estaba en la categoría GENERAL. La Distribución de comidas
-- arma su lista con `esCategoriaViveres()`, que acepta las familias de cocina
-- —alimentos, víveres, carnes, proteínas, limpieza, hortalizas, legumbres,
-- verduras— y GENERAL no está entre ellas. Por eso no aparecía para consumir,
-- aunque es monte y se come.
--
-- LO QUE NO HIZO FALTA TOCAR
-- «Hortalizas y legumbres» YA se toma como categoría de cocina: el filtro
-- busca los fragmentos `hortaliza` y `legumbre` sin acentos ni mayúsculas,
-- así que la categoría entera —sus 8 productos: cebolla, papa, ajo, limones,
-- tomate, cebollín, plátano y verduras variadas— ya entraba. El que quedaba
-- afuera era este producto, por estar mal clasificado.
--
-- EL SKU NO SE TOCA, Y CONVIENE EXPLICAR POR QUÉ
-- El SKU sigue siendo GEN-008. En este sistema el prefijo de esa categoría es
-- HOR (`sku_prefijos`: HORTALIZAS Y LEGUMBRES -> HOR, contador en 8), así que
-- lo «correcto» por convención sería HOR-009. No se renombra porque:
--   · el SKU no participa de la clasificación de cocina, que mira la categoría;
--   · GEN-008 quedó escrito en 4 renglones de órdenes ya cerradas y en 5
--     movimientos de stock. Los renglones son fotos del momento y está bien
--     que sigan diciendo GEN-008, pero renombrar el producto por gusto es
--     mover un identificador que la gente ya vio en papeles;
--   · y sobre todo: renombrar no era lo que se pidió. Lo pedido era que
--     entrara a los consumos de comida, y eso lo resuelve la categoría.
-- Si se decide alinearlo, es un cambio aparte y hoy es seguro hacerlo: ninguna
-- de esas 4 órdenes está esperando recepción, que es lo único que rompería
-- (la recepción casa los renglones por `items[].sku`).
-- ═══════════════════════════════════════════════════════════════════

update public.productos
   set categoria  = 'HORTALIZAS Y LEGUMBRES',
       updated_at = now()
 where sku = 'GEN-008'
   and nombre = 'MONTE SURTIDO';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.estado, p.unidad,
       e.stock, e.costo_promedio,
       (p.categoria ilike '%hortaliza%' or p.categoria ilike '%legumbre%') as entra_a_cocina
  from public.productos p
  left join public.existencias e on e.producto_id = p.id
 where p.nombre = 'MONTE SURTIDO';
