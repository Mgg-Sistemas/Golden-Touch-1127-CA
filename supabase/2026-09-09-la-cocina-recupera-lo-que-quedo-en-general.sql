-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Trece productos de cocina y limpieza salen de GENERAL
--
-- QUÉ PASABA
-- La cocina toca el inventario por dos lados y los dos miran la CATEGORÍA:
--   · Distribución de comidas arma su lista con `esCategoriaViveres()`
--     (alimentos, víveres, carnes, proteínas, limpieza, hortalizas,
--     legumbres, verduras);
--   · la Solicitud de mercado usa esa misma definición más higiene.
-- GENERAL no está en ninguna de las dos. Trece productos que la cocina usa
-- todos los días quedaron ahí, y por eso no se podían ni pedir ni descargar.
--
-- CÓMO SE VIO
-- Cinco de ellos SÍ aparecían en la Solicitud de mercado, pero por un motivo
-- frágil: el mercado anterior (SP-2026-0130, 21/08) los llevaba, y la pantalla
-- arrastra lo que se compró la vez pasada aunque hoy no entre por categoría.
-- El día que un mercado no los lleve, desaparecen. Los otros ocho ya estaban
-- invisibles: todos en stock cero, comprados alguna vez y nunca repuestos.
-- Es el mismo caso de MONTE SURTIDO (ver 2026-09-08-monte-surtido-...).
--
-- LAS DOS DECISIONES QUE NO ERAN MÍAS
-- El vinagre puede leerse como comida o como limpieza. Va a VÍVERES, por
-- pedido expreso. Los dos detergentes van a LIMPIEZA, también por pedido.
--
-- EL SKU NO SE TOCA
-- Siguen siendo GEN-xxx aunque por convención les tocaría VIV / LIM / HOR /
-- PRO. Mismo criterio que con MONTE SURTIDO: el SKU no participa de la
-- clasificación de cocina, quedó escrito en órdenes ya cerradas y en
-- movimientos de stock, y renombrarlo no es lo que se pidió.
--
-- DOS DUPLICADOS QUE ESTE ARCHIVO NO RESUELVE (a propósito)
--   · GEN-181 «BOLSA NEGRA BASURA 25KL / 50UND» (stock 100) y LIM-002
--     «BOLSAS DE BASURA NEGRAS 25 KG» son el mismo artículo cargado dos
--     veces. Al pasar GEN-181 a LIMPIEZA, los dos se verán en el mercado.
--   · GEN-070 «DETERGENTE ACE» y GEN-185 «DETERGENTE OSO BLANCO ACE 10*1KG»
--     también parecen el mismo (ambos en cero).
-- Unificarlos es otra operación: hay que decidir cuál sobrevive y mover el
-- stock y el historial, como se hizo con la esponja (GEN-186 → LIM-001).
-- Se deja anotado, no se hace de oficio.
-- ═══════════════════════════════════════════════════════════════════

-- Comida no perecedera y condimentos
update public.productos
   set categoria = 'VÍVERES', updated_at = now()
 where sku in ('GEN-180',   -- ADOBO IBERIA  12*40G
               'GEN-183',   -- VINAGRE GALON 5L      (decisión del usuario)
               'GEN-184')   -- ATUN
   and categoria = 'GENERAL';

-- Hortalizas
update public.productos
   set categoria = 'HORTALIZAS Y LEGUMBRES', updated_at = now()
 where sku in ('GEN-045',   -- BERENJENA
               'GEN-046',   -- PEPINO
               'GEN-048')   -- CALABACIN
   and categoria = 'GENERAL';

-- Carnes
update public.productos
   set categoria = 'PROTEINA', updated_at = now()
 where sku = 'GEN-065'      -- SALCHICHA DE POLLO
   and categoria = 'GENERAL';

-- Limpieza e higiene
update public.productos
   set categoria = 'LIMPIEZA', updated_at = now()
 where sku in ('GEN-070',   -- DETERGENTE ACE                    (decisión del usuario)
               'GEN-181',   -- BOLSA NEGRA BASURA 25KL / 50UND
               'GEN-182',   -- PAPEL  HIGIENICO ALIVE 600H 12*4R
               'GEN-185',   -- DETERGENTE OSO BLANCO  ACE  10*1KG (decisión del usuario)
               'GEN-276',   -- ESCOBAS CON PALO
               'GEN-277')   -- COLETOS CON PALO
   and categoria = 'GENERAL';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: los trece, con la respuesta a las dos preguntas que
-- importan — ¿la cocina puede consumirlo? ¿aparece en el mercado?
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.estado,
       (lower(translate(p.categoria, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) ~
        '(aliment|viver|carne|proteina|limpi|hortaliza|legumbre|verdura)') as consume_cocina,
       (lower(translate(p.categoria, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) ~
        '(aliment|viver|carne|proteina|limpi|higiene|hortaliza|legumbre|verdura)') as entra_al_mercado
  from public.productos p
 where p.sku in ('GEN-045','GEN-046','GEN-048','GEN-065','GEN-070','GEN-180',
                 'GEN-181','GEN-182','GEN-183','GEN-184','GEN-185','GEN-276','GEN-277')
 order by p.categoria, p.nombre;
